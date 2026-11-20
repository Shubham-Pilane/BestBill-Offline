const express = require('express');
const db = require('../db/db');
const auth = require('../middleware/auth');
const router = express.Router();
const { notifyUpdate } = require('../socket');
const inventoryService = require('../services/inventoryService');

// Get section-to-menu assignments
router.get('/section-menus', auth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT section_name, menu_number FROM section_menus WHERE hotel_id = $1',
      [req.user.hotel_id]
    );
    const map = {};
    result.rows.forEach(r => {
      map[r.section_name] = r.menu_number || 1;
    });
    res.json(map);
  } catch (err) {
    console.error('Error fetching section menus:', err);
    res.status(500).json({ message: 'Error fetching section menus' });
  }
});

// Update section-to-menu assignment
router.post('/section-menus', auth, async (req, res) => {
  try {
    const { section_name, menu_number } = req.body;
    if (!section_name) return res.status(400).json({ message: 'Section name is required' });
    const menuNum = parseInt(menu_number, 10) || 1;
    const hotelId = req.user.hotel_id;

    const existing = await db.query(
      'SELECT * FROM section_menus WHERE hotel_id = $1 AND section_name = $2',
      [hotelId, section_name]
    );
    if (existing.rows.length > 0) {
      await db.query(
        'UPDATE section_menus SET menu_number = $1 WHERE hotel_id = $2 AND section_name = $3',
        [menuNum, hotelId, section_name]
      );
    } else {
      await db.query(
        'INSERT INTO section_menus (hotel_id, section_name, menu_number) VALUES ($1, $2, $3)',
        [hotelId, section_name, menuNum]
      );
    }

    // Update all tables in this section to keep table.menu_number in sync if column exists
    try {
      await db.query(
        'UPDATE tables SET menu_number = $1 WHERE hotel_id = $2 AND floor = $3',
        [menuNum, hotelId, section_name]
      );
    } catch (e) {
      // Ignore if table column not updated yet
    }

    notifyUpdate(hotelId, 'table-update');
    res.json({ success: true, section_name, menu_number: menuNum });
  } catch (err) {
    console.error('Error assigning section menu:', err);
    res.status(500).json({ message: 'Error assigning section menu' });
  }
});

// Get all tables for a hotel
router.get('/', auth, async (req, res) => {
  try {
    let tables;
    try {
      tables = await db.query(
        `SELECT t.*, COALESCE(sm.menu_number, 1) as menu_number, o.id as active_order_id 
         FROM tables t 
         LEFT JOIN section_menus sm ON sm.hotel_id = t.hotel_id AND sm.section_name = t.floor
         LEFT JOIN orders o ON o.table_id = t.id AND o.status = 'active'
         WHERE t.hotel_id = $1 
         ORDER BY t.floor ASC, LENGTH(t.table_number) ASC, t.table_number ASC`,
        [req.user.hotel_id]
      );
    } catch (joinErr) {
      tables = await db.query(
        `SELECT t.*, 1 as menu_number, o.id as active_order_id 
         FROM tables t 
         LEFT JOIN orders o ON o.table_id = t.id AND o.status = 'active'
         WHERE t.hotel_id = $1 
         ORDER BY t.floor ASC, LENGTH(t.table_number) ASC, t.table_number ASC`,
        [req.user.hotel_id]
      );
    }
    res.json(tables.rows);
  } catch (err) {
    console.error('------- TABLES GET ERROR -------');
    console.error(err);
    console.error('--------------------------------');
    res.status(500).json({ message: 'Server error fetching tables', detail: err.message });
  }
});

// Create tables (Batch create)
router.post('/batch', auth, async (req, res) => {
  const { tableNumbers, floor } = req.body;
  if (!tableNumbers || tableNumbers.length === 0) return res.status(400).json({ message: 'No tables provided' });
  
  try {
    const floorValue = floor || 'Floor 1';
    // Resolve menu assigned to this section (defaults to 1)
    let menuNum = 1;
    try {
      const smRes = await db.query(
        'SELECT menu_number FROM section_menus WHERE hotel_id = $1 AND section_name = $2',
        [req.user.hotel_id, floorValue]
      );
      menuNum = smRes.rows[0]?.menu_number || 1;
    } catch (e) {
      menuNum = 1;
    }

    for (const num of tableNumbers) {
       try {
         await db.query(
           'INSERT INTO tables (hotel_id, table_number, floor, menu_number) VALUES ($1, $2, $3, $4)', 
           [req.user.hotel_id, num, floorValue, menuNum]
         );
       } catch (insertErr) {
         if (insertErr.message && insertErr.message.includes('menu_number')) {
           await db.query(
             'INSERT INTO tables (hotel_id, table_number, floor) VALUES ($1, $2, $3)', 
             [req.user.hotel_id, num, floorValue]
           );
         } else {
           throw insertErr;
         }
       }
    }
    res.status(201).json({ message: 'Tables created securely' });
  } catch (err) {
    console.error(err);
    if (err.code === '23505' || (err.message && (err.message.includes('UNIQUE') || err.message.includes('unique')))) {
       const num = tableNumbers && tableNumbers[0];
       if (num && (num.includes('Parcel') || num.includes('Token'))) {
          return res.status(400).json({ message: `${num} already exists` });
       }
       return res.status(400).json({ message: 'Table already exists on this floor' });
    }
    res.status(500).json({ message: 'Error establishing table infrastructure' });
  }
});

// Update table details
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { table_number, capacity, floor } = req.body;
  try {
    let menuNum = 1;
    try {
      const smRes = await db.query(
        'SELECT menu_number FROM section_menus WHERE hotel_id = $1 AND section_name = $2',
        [req.user.hotel_id, floor]
      );
      menuNum = smRes.rows[0]?.menu_number || 1;
    } catch (e) {
      menuNum = 1;
    }

    let result;
    try {
      result = await db.query(
        'UPDATE tables SET table_number = $1, capacity = $2, floor = $3, menu_number = $4 WHERE id = $5 AND hotel_id = $6 RETURNING *',
        [table_number, capacity, floor, menuNum, id, req.user.hotel_id]
      );
    } catch (updateErr) {
      if (updateErr.message && updateErr.message.includes('menu_number')) {
        result = await db.query(
          'UPDATE tables SET table_number = $1, capacity = $2, floor = $3 WHERE id = $4 AND hotel_id = $5 RETURNING *',
          [table_number, capacity, floor, id, req.user.hotel_id]
        );
      } else {
        throw updateErr;
      }
    }
    if (result.rows.length === 0) return res.status(404).json({ message: 'Table not found' });
    notifyUpdate(req.user.hotel_id, 'table-update');
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
       return res.status(400).json({ message: 'Table with this configuration already exists on this floor.' });
    }
    console.error(err);
    res.status(500).json({ message: 'Swap Config protocol failed' });
  }
});

// Get order for a table
router.get('/:tableId/order', auth, async (req, res) => {
  const { tableId } = req.params;
  try {
    const orderQuery = "SELECT * FROM orders WHERE table_id = $1 AND status = 'active'";
    const orderResult = await db.query(orderQuery, [tableId]);
    
    if (orderResult.rows.length === 0) {
      return res.json({ order: null, items: [] });
    }

    const order = orderResult.rows[0];
    const itemsQuery = `
      SELECT oi.id, oi.order_id, oi.menu_item_id, oi.quantity, oi.printed_quantity, oi.max_quantity, oi.is_manual, oi.custom_name, oi.custom_price, oi.notes, oi.sequence,
             COALESCE(oi.custom_name, mi.name, 'Other') as name, mi.marathi_name, COALESCE(oi.custom_price, mi.price, 0) as price, mi.item_number
      FROM order_items oi
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE oi.order_id = $1 AND oi.quantity > 0
      ORDER BY COALESCE(oi.sequence, 0) ASC, oi.created_at ASC
    `;
    const itemsResult = await db.query(itemsQuery, [order.id]);
    
    res.json({ order, items: itemsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching order' });
  }
});

// Send KOT to Kitchen
router.post('/:tableId/order/kot', auth, async (req, res) => {
  const { tableId } = req.params;
  const { waiter, notes } = req.body;
  try {
    const [hotelRes, tableRes, orderRes, userRes] = await Promise.all([
      db.query('SELECT billing_method FROM hotels WHERE id = $1', [req.user.hotel_id]),
      db.query('SELECT table_number, floor FROM tables WHERE id = $1', [tableId]),
      db.query(`
        SELECT o.id as order_id, oi.quantity, oi.printed_quantity, oi.notes, COALESCE(oi.custom_name, mi.name, 'Other') as name, mi.marathi_name
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.table_id = $1 AND o.status = 'active' AND oi.quantity > 0
        ORDER BY COALESCE(oi.sequence, 0) ASC, oi.created_at ASC
      `, [tableId]),
      db.query('SELECT app_language, print_lang_kot FROM users WHERE id = $1', [req.user.id])
    ]);

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ message: 'No active order to print' });
    }

    let printLangKot = (userRes && userRes.rows.length > 0) ? userRes.rows[0].print_lang_kot : 'en';
    const appLang = (userRes && userRes.rows.length > 0) ? userRes.rows[0].app_language : 'en';
    
    if (appLang === 'en') printLangKot = 'en';
    if (appLang === 'mr') printLangKot = 'mr';

    // Filter items to calculate incremental items to print
    const printItems = orderRes.rows
      .filter(item => item.quantity > (item.printed_quantity || 0))
      .map(item => ({
        name: printLangKot === 'mr' ? (item.marathi_name || item.name) : item.name,
        quantity: item.quantity - (item.printed_quantity || 0),
        notes: item.notes || ''
      }));

    if (printItems.length === 0) {
      return res.json({ success: false, message: 'No new item added to cart' });
    }

    let tableNumber = tableRes.rows[0]?.table_number || tableId;
    let finalWaiter = waiter || req.user.name;

    if (req.user.role === 'owner') {
      if (String(tableNumber).toLowerCase().includes('parcel')) {
        finalWaiter = 'Parcel from Counter';
      } else {
        finalWaiter = 'Owner';
      }
    }

    await db.query(
      "UPDATE orders SET waiter_name = $1, guest_note = $2, is_prepared = false, kot_sent_at = CURRENT_TIMESTAMP WHERE id = $3", 
      [finalWaiter, notes || '', orderRes.rows[0].order_id]
    );

    await db.query(
      "UPDATE order_items SET printed_quantity = quantity WHERE order_id = $1",
      [orderRes.rows[0].order_id]
    );

    const printService = require('../services/printService');
    printService.sendKOT({
      hotelId: req.user.hotel_id,
      table: tableNumber,
      floor: tableRes.rows[0]?.floor || '',
      waiter: finalWaiter,
      items: printItems,
      notes: notes || '',
      lang: printLangKot
    });
    return res.json({ success: true, message: 'KOT printed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error printing KOT' });
  }
});

// Add item to order
router.post('/:tableId/order', auth, async (req, res) => {
  const { menuItemId, quantity } = req.body;
  const { tableId } = req.params;

  try {
    let orderRes = await db.query(`SELECT id FROM orders WHERE table_id = $1 AND status = 'active'`, [tableId]);
    let orderId;
    
    if (orderRes.rows.length === 0) {
      const insertOrder = await db.query(
        `INSERT INTO orders (table_id, status, source) VALUES ($1, 'active', 'admin') RETURNING id`,
        [tableId]
      );
      orderId = insertOrder.rows[0].id;
    } else {
      orderId = orderRes.rows[0].id;
    }

    const existingItem = await db.query(
      `SELECT id, quantity, max_quantity FROM order_items WHERE order_id = $1 AND menu_item_id = $2 AND (is_manual IS NOT true)`,
      [orderId, menuItemId]
    );

    if (existingItem.rows.length > 0) {
      const newQty = existingItem.rows[0].quantity + quantity;
      const currentMax = existingItem.rows[0].max_quantity || 0;
      const newMax = Math.max(currentMax, newQty);
      await db.query(
        `UPDATE order_items SET quantity = $1, max_quantity = $2 WHERE id = $3`,
        [newQty, newMax, existingItem.rows[0].id]
      );
    } else {
      const seqRes = await db.query('SELECT COALESCE(MAX(sequence), 0) as max_seq FROM order_items WHERE order_id = $1', [orderId]);
      const nextSeq = (parseInt(seqRes.rows[0]?.max_seq, 10) || 0) + 1;
      await db.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, max_quantity, sequence, notes) VALUES ($1, $2, $3, $3, $4, $5)`,
        [orderId, menuItemId, quantity, nextSeq, req.body.notes || '']
      );
    }

    const query2 = `
      SELECT oi.id, oi.order_id, oi.menu_item_id, oi.quantity, oi.printed_quantity, oi.max_quantity, oi.is_manual, oi.custom_name, oi.custom_price, oi.notes, oi.sequence,
             COALESCE(oi.custom_name, mi.name, 'Other') as name, mi.marathi_name, COALESCE(oi.custom_price, mi.price, 0) as price, mi.item_number
      FROM order_items oi 
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id 
      WHERE oi.order_id = $1 AND oi.quantity > 0
      ORDER BY COALESCE(oi.sequence, 0) ASC, oi.created_at ASC
    `;
    const updatedItems = await db.query(query2, [orderId]);
    notifyUpdate(req.user.hotel_id, 'table-update');
    res.json({ items: updatedItems.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error adding item' });
  }
});

// Add Manual / "Other" Item to order
router.post('/:tableId/order/manual-item', auth, async (req, res) => {
  const { tableId } = req.params;
  const { name = 'Other', price = 0 } = req.body || {};
  try {
    let orderRes = await db.query(`SELECT id FROM orders WHERE table_id = $1 AND status = 'active'`, [tableId]);
    let orderId;
    if (orderRes.rows.length === 0) {
      const insertOrder = await db.query(
        `INSERT INTO orders (table_id, status, source) VALUES ($1, 'active', 'admin') RETURNING id`,
        [tableId]
      );
      orderId = insertOrder.rows[0].id;
    } else {
      orderId = orderRes.rows[0].id;
    }

    const seqRes = await db.query('SELECT COALESCE(MAX(sequence), 0) as max_seq FROM order_items WHERE order_id = $1', [orderId]);
    const nextSeq = (parseInt(seqRes.rows[0]?.max_seq, 10) || 0) + 1;

    await db.query(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, max_quantity, is_manual, custom_name, custom_price, sequence, notes) VALUES ($1, NULL, 1, 1, true, $2, $3, $4, '')`,
      [orderId, (name || 'Other').trim(), parseFloat(price) || 0, nextSeq]
    );

    const query2 = `
      SELECT oi.id, oi.order_id, oi.menu_item_id, oi.quantity, oi.printed_quantity, oi.max_quantity, oi.is_manual, oi.custom_name, oi.custom_price, oi.notes, oi.sequence,
             COALESCE(oi.custom_name, mi.name, 'Other') as name, COALESCE(oi.custom_price, mi.price, 0) as price, mi.item_number
      FROM order_items oi 
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id 
      WHERE oi.order_id = $1 AND oi.quantity > 0
      ORDER BY COALESCE(oi.sequence, 0) ASC, oi.created_at ASC
    `;
    const updatedItems = await db.query(query2, [orderId]);
    notifyUpdate(req.user.hotel_id, 'table-update');
    res.json({ items: updatedItems.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error adding manual item' });
  }
});

// Update custom manual item (name and/or price)
router.put('/:tableId/order/items/:itemId/custom', auth, async (req, res) => {
  const { name, price } = req.body;
  const { itemId, tableId } = req.params;
  try {
    const itemQuery = await db.query(`SELECT order_id FROM order_items WHERE id = $1`, [itemId]);
    if (itemQuery.rows.length === 0) return res.status(404).json({ message: 'Item not found' });
    const orderId = itemQuery.rows[0].order_id;

    const updates = [];
    const params = [];
    let idx = 1;
    if (name !== undefined) {
      updates.push(`custom_name = $${idx++}`);
      params.push((name || 'Other').trim());
    }
    if (price !== undefined) {
      updates.push(`custom_price = $${idx++}`);
      params.push(parseFloat(price) || 0);
    }
    if (updates.length > 0) {
      params.push(itemId);
      await db.query(`UPDATE order_items SET ${updates.join(', ')} WHERE id = $${idx}`, params);
      notifyUpdate(req.user.hotel_id, 'table-update');
    }

    const query2 = `
      SELECT oi.id, oi.order_id, oi.menu_item_id, oi.quantity, oi.printed_quantity, oi.max_quantity, oi.is_manual, oi.custom_name, oi.custom_price, oi.notes, oi.sequence,
             COALESCE(oi.custom_name, mi.name, 'Other') as name, COALESCE(oi.custom_price, mi.price, 0) as price, mi.item_number
      FROM order_items oi 
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id 
      WHERE oi.order_id = $1 AND oi.quantity > 0
      ORDER BY COALESCE(oi.sequence, 0) ASC, oi.created_at ASC
    `;
    const updatedItems = await db.query(query2, [orderId]);
    res.json({ items: updatedItems.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update custom item' });
  }
});

// Update item quantity
router.put('/:tableId/order/items/:itemId', auth, async (req, res) => {
  const { quantity } = req.body;
  const { itemId } = req.params;
  try {
    const itemQuery = await db.query(`SELECT order_id, quantity, max_quantity FROM order_items WHERE id = $1`, [itemId]);
    if (itemQuery.rows.length === 0) return res.status(404).json({ message: 'Item not found' });
    
    const orderId = itemQuery.rows[0].order_id;
    const currentMax = itemQuery.rows[0].max_quantity || 0;
    const newMax = Math.max(currentMax, quantity);

    await db.query(`UPDATE order_items SET quantity = $1, max_quantity = $2 WHERE id = $3`, [quantity, newMax, itemId]);
    notifyUpdate(req.user.hotel_id, 'table-update');

    const query2 = `
      SELECT oi.id, oi.order_id, oi.menu_item_id, oi.quantity, oi.printed_quantity, oi.max_quantity, oi.is_manual, oi.custom_name, oi.custom_price, oi.notes, oi.sequence,
             COALESCE(oi.custom_name, mi.name, 'Other') as name, mi.marathi_name, COALESCE(oi.custom_price, mi.price, 0) as price, mi.item_number
      FROM order_items oi 
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id 
      WHERE oi.order_id = $1 AND oi.quantity > 0
      ORDER BY COALESCE(oi.sequence, 0) ASC, oi.created_at ASC
    `;
    const updatedItems = await db.query(query2, [orderId]);
    res.json({ items: updatedItems.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Update failed' });
  }
});

// Update item notes
router.put('/:tableId/order/items/:itemId/notes', auth, async (req, res) => {
  const { notes } = req.body;
  const { itemId, tableId } = req.params;
  try {
    const orderRes = await db.query(`SELECT id FROM orders WHERE table_id = $1 AND status = 'active'`, [tableId]);
    const activeOrderId = orderRes.rows[0]?.id;
    let itemQuery = await db.query(`SELECT id, order_id FROM order_items WHERE id = $1`, [itemId]);
    if (itemQuery.rows.length === 0 && activeOrderId) {
      itemQuery = await db.query(`SELECT id, order_id FROM order_items WHERE order_id = $1 AND (menu_item_id = $2 OR id = $2)`, [activeOrderId, itemId]);
    }
    if (itemQuery.rows.length === 0) return res.status(404).json({ message: 'Item not found' });
    const resolvedId = itemQuery.rows[0].id;
    const orderId = itemQuery.rows[0].order_id;

    await db.query(`UPDATE order_items SET notes = $1 WHERE id = $2`, [notes || '', resolvedId]);
    notifyUpdate(req.user.hotel_id, 'table-update');

    const query2 = `
      SELECT oi.id, oi.order_id, oi.menu_item_id, oi.quantity, oi.printed_quantity, oi.max_quantity, oi.is_manual, oi.custom_name, oi.custom_price, oi.notes, oi.sequence,
             COALESCE(oi.custom_name, mi.name, 'Other') as name, mi.marathi_name, COALESCE(oi.custom_price, mi.price, 0) as price, mi.item_number
      FROM order_items oi 
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id 
      WHERE oi.order_id = $1 AND oi.quantity > 0
      ORDER BY COALESCE(oi.sequence, 0) ASC, oi.created_at ASC
    `;
    const updatedItems = await db.query(query2, [orderId]);
    res.json({ items: updatedItems.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update item notes' });
  }
});

// Update entire order items sequence
router.put('/:tableId/order/sequence', auth, async (req, res) => {
  const { itemIds } = req.body;
  const { tableId } = req.params;
  try {
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: 'Invalid item IDs array' });
    }
    for (let index = 0; index < itemIds.length; index++) {
      await db.query(`UPDATE order_items SET sequence = $1 WHERE id = $2`, [index + 1, itemIds[index]]);
    }
    notifyUpdate(req.user.hotel_id, 'table-update');
    res.json({ success: true });
  } catch (err) {
    console.error('Sequence update error:', err);
    res.status(500).json({ message: 'Failed to update item sequence' });
  }
});

// Delete item
router.delete('/:tableId/order/items/:itemId', auth, async (req, res) => {
  const { itemId, tableId } = req.params;
  
  try {
    const itemCheck = await db.query('SELECT order_id, printed_quantity, quantity, max_quantity FROM order_items WHERE id = $1', [itemId]);
    
    if (itemCheck.rows.length === 0) {
      const orderCheck = await db.query('SELECT id FROM orders WHERE table_id = $1 AND status = $2', [tableId, 'active']);
      if (orderCheck.rows.length === 0) return res.json({ items: [], order_deleted: true });
      
      const currentItems = await db.query(`
        SELECT oi.id, oi.order_id, oi.menu_item_id, oi.quantity, oi.printed_quantity, oi.max_quantity, oi.is_manual, oi.custom_name, oi.custom_price, oi.notes, oi.sequence,
               COALESCE(oi.custom_name, mi.name, 'Other') as name, mi.marathi_name, COALESCE(oi.custom_price, mi.price, 0) as price, mi.item_number
        FROM order_items oi 
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id 
        WHERE oi.order_id = $1 AND oi.quantity > 0 ORDER BY COALESCE(oi.sequence, 0) ASC, oi.created_at ASC
      `, [orderCheck.rows[0].id]);
      return res.json({ items: currentItems.rows, order_deleted: false });
    }

    const orderId = itemCheck.rows[0].order_id;

    await db.query('UPDATE order_items SET quantity = 0 WHERE id = $1', [itemId]);

    const remainingRes = await db.query('SELECT COALESCE(SUM(quantity), 0) as total_qty FROM order_items WHERE order_id = $1', [orderId]);
    const totalActiveQty = parseInt(remainingRes.rows[0].total_qty || 0);

    let isOrderCleared = false;
    if (totalActiveQty === 0) {
      const allItemsRes = await db.query(`
        SELECT oi.id, oi.printed_quantity, COALESCE(NULLIF(oi.max_quantity, 0), oi.quantity, 1) as item_qty,
               COALESCE(oi.custom_name, mi.name, 'Other') as name, COALESCE(oi.custom_price, mi.price, 0) as price
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = $1 AND (oi.max_quantity > 0 OR oi.quantity > 0)
      `, [orderId]);

      if (allItemsRes.rows.length > 0) {
        const orderInfoRes = await db.query('SELECT kot_sent_at FROM orders WHERE id = $1', [orderId]);
        const tableInfoRes = await db.query('SELECT table_number, floor FROM tables WHERE id = $1', [tableId]);

        const kotSentAt = orderInfoRes.rows[0]?.kot_sent_at;
        const hasPrintedItem = allItemsRes.rows.some(i => (i.printed_quantity || 0) > 0);
        const kotStatus = (kotSentAt || hasPrintedItem) ? 'Printed' : 'Not Printed';
        const billingStatus = 'Not Settled';

        const items = allItemsRes.rows.map(i => ({
          name: i.name,
          price: parseFloat(i.price || 0),
          quantity: parseInt(i.item_qty || 1)
        }));

        const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
        const totalAmount = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const tableNumber = tableInfoRes.rows[0]?.table_number || `Table ${tableId}`;
        const floor = tableInfoRes.rows[0]?.floor || 'Floor 1';
        const cancelledBy = req.user.name || (req.user.role === 'owner' ? 'Owner' : 'Staff');
        const orderNumber = `ORD-${orderId}`;

        await db.query(
          `INSERT INTO cancelled_orders 
           (hotel_id, order_number, table_id, table_number, floor, cancelled_by, items_json, total_quantity, total_amount, cancellation_reason, kot_status, billing_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            req.user.hotel_id,
            orderNumber,
            tableId,
            tableNumber,
            floor,
            cancelledBy,
            JSON.stringify(items),
            totalQty,
            totalAmount,
            'All items removed',
            kotStatus,
            billingStatus
          ]
        );
      }

      const updateOrderRes = await db.query("UPDATE orders SET status = 'cancelled' WHERE id = $1 RETURNING id", [orderId]);
      if (updateOrderRes.rows.length > 0) {
        isOrderCleared = true;
      }
    }
    
    if (isOrderCleared || totalActiveQty === 0) {
      notifyUpdate(req.user.hotel_id, 'table-update');
      return res.json({ items: [], order_deleted: true });
    }

    const updatedItems = await db.query(`
      SELECT oi.id, oi.order_id, oi.menu_item_id, oi.quantity, oi.printed_quantity, oi.max_quantity, oi.is_manual, oi.custom_name, oi.custom_price, oi.notes, oi.sequence,
             COALESCE(oi.custom_name, mi.name, 'Other') as name, mi.marathi_name, COALESCE(oi.custom_price, mi.price, 0) as price, mi.item_number
      FROM order_items oi 
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id 
      WHERE oi.order_id = $1 AND oi.quantity > 0 ORDER BY COALESCE(oi.sequence, 0) ASC, oi.created_at ASC
    `, [orderId]);

    notifyUpdate(req.user.hotel_id, 'table-update');
    res.json({ items: updatedItems.rows, order_deleted: false });

  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ message: 'Removal failed' });
  }
});

// Explicit Clear Table / Cancel Order endpoint
router.post('/:tableId/clear-order', auth, async (req, res) => {
  const { tableId } = req.params;
  const { reason } = req.body;

  try {
    const orderRes = await db.query(`SELECT id FROM orders WHERE table_id = $1 AND status = 'active'`, [tableId]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ message: 'No active order to clear' });
    }
    const orderId = orderRes.rows[0].id;

    const [tableRes, itemsRes] = await Promise.all([
      db.query('SELECT table_number, floor FROM tables WHERE id = $1', [tableId]),
      db.query(`
        SELECT oi.quantity, oi.printed_quantity, COALESCE(NULLIF(oi.max_quantity, 0), oi.quantity, 1) as item_qty,
               COALESCE(oi.custom_name, mi.name, 'Other') as name, COALESCE(oi.custom_price, mi.price, 0) as price
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = $1 AND (oi.quantity > 0 OR oi.max_quantity > 0)
      `, [orderId])
    ]);

    if (itemsRes.rows.length > 0) {
      const kotSentAtRes = await db.query('SELECT kot_sent_at FROM orders WHERE id = $1', [orderId]);
      const kotSentAt = kotSentAtRes.rows[0]?.kot_sent_at;
      const hasPrintedItem = itemsRes.rows.some(i => (i.printed_quantity || 0) > 0);
      const kotStatus = (kotSentAt || hasPrintedItem) ? 'Printed' : 'Not Printed';
      const billingStatus = 'Not Settled';

      const items = itemsRes.rows.map(i => ({
        name: i.name,
        price: parseFloat(i.price || 0),
        quantity: parseInt(i.item_qty || i.quantity || 1)
      }));

      const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
      const totalAmount = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const tableNumber = tableRes.rows[0]?.table_number || `Table ${tableId}`;
      const floor = tableRes.rows[0]?.floor || 'Floor 1';
      const cancelledBy = req.user.name || (req.user.role === 'owner' ? 'Owner' : 'Staff');
      const orderNumber = `ORD-${orderId}`;

      await db.query(
        `INSERT INTO cancelled_orders 
         (hotel_id, order_number, table_id, table_number, floor, cancelled_by, items_json, total_quantity, total_amount, cancellation_reason, kot_status, billing_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          req.user.hotel_id,
          orderNumber,
          tableId,
          tableNumber,
          floor,
          cancelledBy,
          JSON.stringify(items),
          totalQty,
          totalAmount,
          reason || 'Table Cleared by user',
          kotStatus,
          billingStatus
        ]
      );
    }

    await db.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [orderId]);
    notifyUpdate(req.user.hotel_id, 'table-update');

    res.json({ success: true, message: 'Table cleared and cancelled order recorded successfully' });
  } catch (err) {
    console.error('[CLEAR ORDER ROUTE ERROR]', err);
    res.status(500).json({ message: 'Failed to clear order', error: err.message });
  }
});

// Generate Bill
router.post('/:tableId/bill', auth, async (req, res) => {
  const { tableId } = req.params;
  const { discount_percentage, discount_type, discount_amount, discount_value, selected_discount_item_ids, notes } = req.body;
  
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const [hotelRes, tableRes, orderRes] = await Promise.all([
      client.query('SELECT name, phone, location, gst_percentage, cgst_percentage, sgst_percentage, billing_method FROM hotels WHERE id = $1', [req.user.hotel_id]),
      client.query('SELECT table_number FROM tables WHERE id = $1', [tableId]),
      client.query(`
        SELECT o.id as order_id, oi.id, oi.id as oi_id, oi.menu_item_id, oi.quantity, oi.notes, oi.sequence,
               COALESCE(oi.custom_name, mi.name, 'Other') as name, mi.marathi_name, COALESCE(oi.custom_price, mi.price, 0) as price, mi.item_number
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.table_id = $1 AND o.status = 'active' AND oi.quantity > 0
        ORDER BY COALESCE(oi.sequence, 0) ASC, oi.created_at ASC
      `, [tableId])
    ]);

    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No active order' });
    }
    
    const orderId = orderRes.rows[0].order_id;
    const gstRate = parseFloat(hotelRes.rows[0].gst_percentage || 0);
    const cgstRate = parseFloat(hotelRes.rows[0].cgst_percentage || 0);
    const sgstRate = parseFloat(hotelRes.rows[0].sgst_percentage || 0);

    const subtotal = orderRes.rows.reduce((sum, item) => sum + (parseFloat(item.price) * parseInt(item.quantity)), 0);
    const gst = Number(((subtotal * gstRate) / 100).toFixed(2));
    const cgst = Number(((subtotal * cgstRate) / 100).toFixed(2));
    const sgst = Number(((subtotal * sgstRate) / 100).toFixed(2));
    const initialTotal = subtotal + gst + cgst + sgst;

    const discType = discount_type === 'amount' ? 'amount' : 'percentage';
    let discountAmount = 0;
    let discountPct = 0;

    let targetBaseTotal = initialTotal;
    if (Array.isArray(selected_discount_item_ids)) {
      if (selected_discount_item_ids.length > 0) {
        const selectedSet = new Set(selected_discount_item_ids.map(id => String(id)));
        const selectedSubtotal = orderRes.rows.reduce((sum, item) => {
          const idStr = String(item.id || item.oi_id || '');
          const menuIdStr = item.menu_item_id ? String(item.menu_item_id) : '';
          if (selectedSet.has(idStr) || (menuIdStr && selectedSet.has(menuIdStr))) {
            return sum + (parseFloat(item.price) * parseInt(item.quantity));
          }
          return sum;
        }, 0);
        targetBaseTotal = selectedSubtotal * (1 + (gstRate + cgstRate + sgstRate) / 100);
      } else {
        targetBaseTotal = 0;
      }
    }

    if (discType === 'amount') {
      const rawAmt = parseFloat(discount_amount !== undefined ? discount_amount : (discount_value !== undefined ? discount_value : 0)) || 0;
      discountAmount = Math.min(targetBaseTotal, Math.max(0, rawAmt));
      discountPct = targetBaseTotal > 0 ? Number(((discountAmount / targetBaseTotal) * 100).toFixed(2)) : 0;
    } else {
      discountPct = Math.max(0, Math.min(100, parseFloat(discount_percentage !== undefined ? discount_percentage : discount_value) || 0));
      discountAmount = Number((targetBaseTotal * (discountPct / 100)).toFixed(2));
    }

    const unroundedTotal = Math.max(0, Number((initialTotal - discountAmount).toFixed(2)));
    const finalAmount = Math.ceil(unroundedTotal);
    let roundOff = Number((finalAmount - unroundedTotal).toFixed(2));
    if (roundOff < 0.001 || roundOff >= 1) {
      roundOff = 0;
    }

    // Deduct stock from inventory for standard menu items
    await inventoryService.deductStockForOrder(orderId, req.user.hotel_id, client);

    // Calculate daily sequential bill number (1 to N) for this hotel and date
    let nextBillNumber = 1;
    try {
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const numRes = await client.query(
        `SELECT COALESCE(MAX(b.bill_number), 0) + 1 AS next_bill_no
         FROM bills b
         JOIN orders o ON b.order_id = o.id
         LEFT JOIN tables t ON o.table_id = t.id
         LEFT JOIN rooms r ON o.room_id = r.id
         WHERE (t.hotel_id = $1 OR r.hotel_id = $1)
           AND (
             substr(b.created_at, 1, 10) = $2
             OR date(b.created_at) = date($2)
             OR date(b.created_at, 'localtime') = date($2)
           )`,
        [req.user.hotel_id, localDate]
      );
      if (numRes.rows.length > 0 && numRes.rows[0].next_bill_no) {
        nextBillNumber = parseInt(numRes.rows[0].next_bill_no, 10);
      }
    } catch (numErr) {
      console.warn('[TABLE BILL] Daily bill number calculation note:', numErr.message);
    }

    const billRes = await client.query(
      `INSERT INTO bills (order_id, total_amount, gst, cgst, sgst, round_off, final_amount, discount_percentage, discount_type, discount_amount, notes, bill_number) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [orderId, subtotal, gst, cgst, sgst, roundOff, finalAmount, discountPct, discType, discountAmount, notes || '', nextBillNumber]
    );

    await client.query(`UPDATE orders SET status = 'completed' WHERE id = $1`, [orderId]);
    
    await client.query('COMMIT');

    const responsePayload = {
      ...billRes.rows[0],
      discount_type: discType,
      discount_amount: discountAmount,
      discount_percentage: discountPct,
      subtotal: subtotal,
      total_amount: finalAmount,
      gst_percentage: gstRate,
      cgst_percentage: cgstRate,
      sgst_percentage: sgstRate,
      cgst: cgst,
      sgst: sgst,
      round_off: roundOff,
      items: orderRes.rows,
      notes: notes || '',
      hotel_name: hotelRes.rows[0].name,
      hotel_phone: hotelRes.rows[0].phone,
      hotel_location: hotelRes.rows[0].location
    };

    notifyUpdate(req.user.hotel_id, 'table-update');
    res.json(responsePayload);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    if (err.message && err.message.includes('Insufficient stock')) {
      res.status(400).json({ message: `Ingredients added to this dish in inventory are not enough to make this dish. ${err.message}` });
    } else {
      res.status(500).json({ message: 'Billing error', error: err.message });
    }
  } finally {
    client.release();
  }
});

// Rollback/Cancel Bill (Return to active order)
router.delete('/:tableId/bill/:billId', auth, async (req, res) => {
  const { billId } = req.params;
  try {
    const billCheck = await db.query('SELECT order_id FROM bills WHERE id = $1', [billId]);
    if (billCheck.rows.length === 0) return res.status(404).json({ message: 'Bill not found' });
    const orderId = billCheck.rows[0].order_id;
    
    await db.query('DELETE FROM bills WHERE id = $1', [billId]);
    await db.query("UPDATE orders SET status = 'active' WHERE id = $1", [orderId]);
    notifyUpdate(req.user.hotel_id, 'table-update');
    
    res.json({ message: 'Bill rolled back, order is active again' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Rollback failed' });
  }
});

// Send notification
router.post('/:tableId/bill/send', auth, async (req, res) => {
  const { method, customerPhone, billId } = req.body;
  
  try {
     const hotelRes = await db.query('SELECT name FROM hotels WHERE id = $1', [req.user.hotel_id]);
     const hotelName = hotelRes.rows[0].name;

     const billRes = await db.query('SELECT * FROM bills WHERE id = $1', [billId]);
     const bill = billRes.rows[0];

     const itemsRes = await db.query(
        `SELECT COALESCE(oi.custom_name, mi.name, 'Other') as name, oi.quantity 
         FROM order_items oi 
         LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id 
         WHERE oi.order_id = $1 AND oi.quantity > 0`,
        [bill.order_id]
     );
     const items = itemsRes.rows;

     let msg = `*--- ${hotelName.toUpperCase()} ---*\n`;
     msg += `Bill #${billId}\n`;
     items.forEach(i => msg += `${i.name} x ${i.quantity}\n`);
     msg += `Total: ₹${bill.final_amount}\n`;
     msg += `Thanks for visiting!`;

      if (method === 'whatsapp') {
         console.log(`[Notification] WhatsApp link generated for ${customerPhone}.`);
      }

      res.json({ success: true, message: `Invoice processed via ${method.toUpperCase()}` });
  } catch (err) {
     console.error(err);
     res.status(500).json({ message: 'Error dispatching invoice' });
  }
});

// Delete table
router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM tables WHERE id = $1 AND hotel_id = $2', [id, req.user.hotel_id]);
    res.json({ message: 'Table deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed' });
  }
});

// Mark bill as paid
router.put('/bill/:billId/pay', auth, async (req, res) => {
  const { billId } = req.params;
  const { method, cash_amount, online_amount } = req.body || {};
  try {
     let cashVal = parseFloat(cash_amount || 0);
     let onlineVal = parseFloat(online_amount || 0);
     if (method === 'cash') {
       const bRes = await db.query('SELECT final_amount FROM bills WHERE id = $1', [billId]);
       cashVal = parseFloat(bRes.rows[0]?.final_amount || 0);
       onlineVal = 0;
     } else if (method === 'upi' || method === 'online') {
       const bRes = await db.query('SELECT final_amount FROM bills WHERE id = $1', [billId]);
       onlineVal = parseFloat(bRes.rows[0]?.final_amount || 0);
       cashVal = 0;
     }

     const result = await db.query(
        'UPDATE bills SET is_paid = true, payment_method = $1, cash_amount = $2, online_amount = $3 WHERE id = $4 RETURNING *',
        [method || 'cash', cashVal, onlineVal, billId]
     );
     if (result.rows.length === 0) return res.status(404).json({ message: 'Bill record not found' });
     notifyUpdate(req.user.hotel_id, 'table-update');
     res.json({ success: true, bill: result.rows[0] });
  } catch (err) {
     console.error(err);
     res.status(500).json({ message: 'Error updating payment status' });
  }
});

// Swap table (Transfer active order)
router.post('/:tableId/swap', auth, async (req, res) => {
  const { tableId } = req.params;
  const { targetTableId } = req.body;
  
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    
    const sourceOrder = await client.query('SELECT id FROM orders WHERE table_id = $1 AND status = $2', [tableId, 'active']);
    if (sourceOrder.rows.length === 0) return res.status(400).json({ message: 'No active order to swap' });
    
    const targetOrder = await client.query('SELECT id FROM orders WHERE table_id = $1 AND status = $2', [targetTableId, 'active']);
    if (targetOrder.rows.length > 0) return res.status(400).json({ message: 'Target table is busy' });

    await client.query('UPDATE orders SET table_id = $1 WHERE id = $2', [targetTableId, sourceOrder.rows[0].id]);
    
    await client.query('COMMIT');
    notifyUpdate(req.user.hotel_id, 'table-update');
    res.json({ message: 'Table successfully swapped' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Swap failed' });
  } finally {
    client.release();
  }
});

module.exports = router;
