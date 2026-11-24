const express = require('express');
const db = require('../db/db');
const auth = require('../middleware/auth');
const { notifyUpdate } = require('../socket');
const printService = require('../services/printService');
const router = express.Router();

// Get kitchen orders (KOT History & Live Display)
router.get('/orders', auth, async (req, res) => {
  try {
    const { filter } = req.query; // 'today', 'yesterday', 'all'
    
    let dateCondition = "AND date(o.kot_sent_at) = date('now', 'localtime')";
    if (filter === 'yesterday') {
      dateCondition = "AND date(o.kot_sent_at) = date('now', 'localtime', '-1 day')";
    } else if (filter === 'all') {
      dateCondition = "AND o.kot_sent_at >= datetime('now', '-30 days')";
    } else if (filter === 'active') {
      dateCondition = "AND date(o.kot_sent_at) = date('now', 'localtime') AND COALESCE(o.is_prepared, false) = false";
    }

    const ordersResult = await db.query(
      `SELECT 
         o.id as order_id,
         o.table_id,
         o.created_at,
         o.status,
         o.guest_note,
         o.source,
         o.waiter_name,
         o.kot_sent_at,
         o.is_prepared,
         t.table_number,
         t.floor as table_floor
       FROM orders o
       JOIN tables t ON o.table_id = t.id
       WHERE t.hotel_id = $1
         AND o.status IN ('active', 'completed', 'cancelled')
         AND o.kot_sent_at IS NOT NULL
         ${dateCondition}
       ORDER BY o.kot_sent_at DESC
       LIMIT 200`,
      [req.user.hotel_id]
    );

    if (ordersResult.rows.length === 0) {
      return res.json([]);
    }

    const orderIds = ordersResult.rows.map(o => o.order_id);
    
    // Fetch items for all these orders
    const itemsResult = await db.query(
      `SELECT oi.id, oi.order_id, COALESCE(oi.custom_name, mi.name, 'Item') as name, mi.marathi_name, oi.quantity, COALESCE(oi.custom_price, mi.price, 0) as price, oi.notes
       FROM order_items oi
       LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE oi.order_id IN (${orderIds.map((_, i) => `$${i + 1}`).join(', ')})
         AND oi.quantity > 0`,
      orderIds
    );

    // Group items by order_id
    const itemsByOrder = {};
    itemsResult.rows.forEach(item => {
      if (!itemsByOrder[item.order_id]) {
        itemsByOrder[item.order_id] = [];
      }
      itemsByOrder[item.order_id].push({
        id: item.id,
        name: item.name,
        marathi_name: item.marathi_name,
        quantity: item.quantity,
        price: item.price,
        notes: item.notes
      });
    });

    // Map order rows to frontend payload structure
    const activeOrders = ordersResult.rows.map(order => {
      const items = itemsByOrder[order.order_id] || [];
      
      // Calculate total amount for dine-in orders
      const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

      return {
        ...order,
        total_amount: totalAmount,
        items
      };
    }).filter(o => o.items.length > 0);

    res.json(activeOrders);
  } catch (err) {
    console.error('Error fetching kitchen orders:', err);
    res.status(500).json({ message: 'Error fetching kitchen orders' });
  }
});

// Mark order as prepared
router.put('/orders/:orderId/prepare', auth, async (req, res) => {
  const { orderId } = req.params;
  try {
    const result = await db.query(
      `UPDATE orders 
       SET is_prepared = true 
       WHERE id = $1 AND EXISTS (
         SELECT 1 FROM orders o
         JOIN tables t ON o.table_id = t.id
         WHERE o.id = $1 AND t.hotel_id = $2
       ) RETURNING *`,
      [orderId, req.user.hotel_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    notifyUpdate(req.user.hotel_id, 'table-update');
    notifyUpdate(req.user.hotel_id, 'kitchen-update');

    res.json({ success: true, message: 'Order marked as prepared' });
  } catch (err) {
    console.error('Error preparing order:', err);
    res.status(500).json({ message: 'Error updating order status' });
  }
});

// Reprint a specific KOT order
router.post('/orders/:orderId/reprint', auth, async (req, res) => {
  const { orderId } = req.params;
  try {
    const orderRes = await db.query(
      `SELECT o.id as order_id, o.waiter_name, o.guest_note, o.kot_sent_at,
              t.table_number, t.floor as table_floor
       FROM orders o
       JOIN tables t ON o.table_id = t.id
       WHERE o.id = $1 AND t.hotel_id = $2`,
      [orderId, req.user.hotel_id]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ message: 'KOT order not found' });
    }

    const orderRow = orderRes.rows[0];

    const itemsRes = await db.query(
      `SELECT oi.id, oi.quantity, oi.notes, COALESCE(oi.custom_name, mi.name, 'Item') as name,
              mi.marathi_name
       FROM order_items oi
       LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE oi.order_id = $1 AND oi.quantity > 0`,
      [orderId]
    );

    if (itemsRes.rows.length === 0) {
      return res.status(400).json({ message: 'No items found in this KOT to print' });
    }

    const userRes = await db.query(
      'SELECT app_language, print_lang_kot FROM users WHERE id = $1',
      [req.user.id]
    );

    let printLangKot = (userRes && userRes.rows.length > 0) ? userRes.rows[0].print_lang_kot : 'en';
    const appLang = (userRes && userRes.rows.length > 0) ? userRes.rows[0].app_language : 'en';
    if (appLang === 'en') printLangKot = 'en';
    if (appLang === 'mr') printLangKot = 'mr';

    const printItems = itemsRes.rows.map(item => ({
      name: printLangKot === 'mr' ? (item.marathi_name || item.name) : item.name,
      quantity: item.quantity,
      notes: item.notes || ''
    }));

    let tableNumber = orderRow.table_number;
    let finalWaiter = orderRow.waiter_name || req.user.name || 'Staff';

    printService.sendKOT({
      hotelId: req.user.hotel_id,
      table: `${tableNumber} (REPRINT)`,
      floor: orderRow.table_floor || '',
      waiter: finalWaiter,
      items: printItems,
      notes: orderRow.guest_note ? `${orderRow.guest_note}\n*** REPRINT KOT ***` : '*** REPRINT KOT ***',
      lang: printLangKot,
      isReprint: true
    });

    notifyUpdate(req.user.hotel_id, 'kitchen-update');

    return res.json({ success: true, message: `KOT for Table ${tableNumber} reprinted successfully` });
  } catch (err) {
    console.error('Error reprinting KOT:', err);
    res.status(500).json({ message: 'Error reprinting KOT order' });
  }
});

module.exports = router;
