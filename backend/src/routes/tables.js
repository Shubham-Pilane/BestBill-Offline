const express = require('express');
const db = require('../db/db');
const auth = require('../middleware/auth');
const router = express.Router();
const { notifyUpdate } = require('../socket');
const inventoryService = require('../services/inventoryService');

// Get all tables for a hotel
router.get('/', auth, async (req, res) => {
  try {
    const tables = await db.query(
      `SELECT t.*, o.id as active_order_id 
       FROM tables t 
       LEFT JOIN orders o ON o.table_id = t.id AND o.status = 'active'
       WHERE t.hotel_id = $1 
       ORDER BY t.floor ASC, LENGTH(t.table_number) ASC, t.table_number ASC`,
      [req.user.hotel_id]
    );
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
    for (const num of tableNumbers) {
       await db.query('INSERT INTO tables (hotel_id, table_number, floor) VALUES ($1, $2, $3)', [req.user.hotel_id, num, floorValue]);
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
    const result = await db.query(
      'UPDATE tables SET table_number = $1, capacity = $2, floor = $3 WHERE id = $4 AND hotel_id = $5 RETURNING *',
      [table_number, capacity, floor, id, req.user.hotel_id]
    );
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
      SELECT oi.id, oi.order_id, oi.menu_item_id, oi.quantity, mi.name, mi.price
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE oi.order_id = $1 AND oi.quantity > 0
      ORDER BY oi.created_at ASC
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
  console.log(`[KOT DEBUG] Request received for tableId: ${tableId}, user:`, req.user);
  try {
    const [hotelRes, tableRes, orderRes] = await Promise.all([
      db.query('SELECT billing_method FROM hotels WHERE id = $1', [req.user.hotel_id]),
      db.query('SELECT table_number, floor FROM tables WHERE id = $1', [tableId]),
      db.query(`
        SELECT o.id as order_id, oi.quantity, oi.printed_quantity, mi.name
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.table_id = $1 AND o.status = 'active' AND oi.quantity > 0
      `, [tableId])
    ]);

    console.log('[KOT DEBUG] hotelRes rows:', hotelRes.rows);
    console.log('[KOT DEBUG] tableRes rows:', tableRes.rows);
    console.log('[KOT DEBUG] orderRes rows:', orderRes.rows);

    if (orderRes.rows.length === 0) {
      console.log('[KOT DEBUG] Returning 404 - No active order items found');
      return res.status(404).json({ message: 'No active order to print' });
    }

    // Filter items to calculate incremental items to print
    const printItems = orderRes.rows
      .filter(item => item.quantity > (item.printed_quantity || 0))
      .map(item => ({
        name: item.name,
        quantity: item.quantity - (item.printed_quantity || 0)
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

    // Update waiter name, notes, KOT timestamp and reset preparation status for kitchen queue
    await db.query(
      "UPDATE orders SET waiter_name = $1, guest_note = $2, is_prepared = false, kot_sent_at = CURRENT_TIMESTAMP WHERE id = $3", 
      [finalWaiter, notes || '', orderRes.rows[0].order_id]
    );

    // Update printed_quantity = quantity for all order items of this active order
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
      notes: notes || ''
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
    // Find or create active order for the table
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

    // Insert or update order item manually to avoid ON CONFLICT constraint requirements
    const existingItem = await db.query(
      `SELECT id, quantity, max_quantity FROM order_items WHERE order_id = $1 AND menu_item_id = $2`,
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
      await db.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, max_quantity) VALUES ($1, $2, $3, $3)`,
        [orderId, menuItemId, quantity, quantity]
      );
    }

    const query2 = `
      SELECT oi.*, mi.name, mi.price 
      FROM order_items oi 
      JOIN menu_items mi ON oi.menu_item_id = mi.id 
      WHERE oi.order_id = $1 AND oi.quantity > 0
      ORDER BY oi.created_at ASC
    `;
    const updatedItems = await db.query(query2, [orderId]);
    notifyUpdate(req.user.hotel_id, 'table-update');
    res.json({ items: updatedItems.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error adding item' });
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
      SELECT oi.*, mi.name, mi.price 
      FROM order_items oi 
      JOIN menu_items mi ON oi.menu_item_id = mi.id 
      WHERE oi.order_id = $1 AND oi.quantity > 0
      ORDER BY oi.created_at ASC
    `;
    const updatedItems = await db.query(query2, [orderId]);
    res.json({ items: updatedItems.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Update failed' });
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
        SELECT oi.*, mi.name, mi.price FROM order_items oi 
        JOIN menu_items mi ON oi.menu_item_id = mi.id 
        WHERE oi.order_id = $1 AND oi.quantity > 0 ORDER BY oi.created_at ASC
      `, [orderCheck.rows[0].id]);
      return res.json({ items: currentItems.rows, order_deleted: false });
    }

    const orderId = itemCheck.rows[0].order_id;

    // Set quantity = 0 for this item, preserving max_quantity so full history is recorded if order gets cleared!
    await db.query('UPDATE order_items SET quantity = 0 WHERE id = $1', [itemId]);

    // Check remaining total active quantity on this order
    const remainingRes = await db.query('SELECT COALESCE(SUM(quantity), 0) as total_qty FROM order_items WHERE order_id = $1', [orderId]);
    const totalActiveQty = parseInt(remainingRes.rows[0].total_qty || 0);

    let isOrderCleared = false;
    if (totalActiveQty === 0) {
      // All items removed! Fetch ALL items that were part of this order using COALESCE(NULLIF(max_quantity, 0), quantity, 1)
      const allItemsRes = await db.query(`
        SELECT oi.id, oi.printed_quantity, COALESCE(NULLIF(oi.max_quantity, 0), oi.quantity, 1) as item_qty, mi.name, mi.price
        FROM order_items oi
        JOIN menu_items mi ON oi.menu_item_id = mi.id
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
      SELECT oi.*, mi.name, mi.price FROM order_items oi 
      JOIN menu_items mi ON oi.menu_item_id = mi.id 
      WHERE oi.order_id = $1 AND oi.quantity > 0 ORDER BY oi.created_at ASC
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

    // Fetch details & Record cancelled order
    const [tableRes, itemsRes] = await Promise.all([
      db.query('SELECT table_number, floor FROM tables WHERE id = $1', [tableId]),
      db.query(`
        SELECT oi.quantity, oi.printed_quantity, COALESCE(NULLIF(oi.max_quantity, 0), oi.quantity, 1) as item_qty, mi.name, mi.price
        FROM order_items oi
        JOIN menu_items mi ON oi.menu_item_id = mi.id
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
  const { discount_percentage, selected_discount_item_ids } = req.body;
  
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const [hotelRes, tableRes, orderRes] = await Promise.all([
      client.query('SELECT name, phone, location, gst_percentage, billing_method FROM hotels WHERE id = $1', [req.user.hotel_id]),
      client.query('SELECT table_number FROM tables WHERE id = $1', [tableId]),
      client.query(`
        SELECT o.id as order_id, oi.id, oi.menu_item_id, oi.quantity, mi.name, mi.price
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.table_id = $1 AND o.status = 'active' AND oi.quantity > 0
      `, [tableId])
    ]);

    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'No active order' });
    }
    
    const orderId = orderRes.rows[0].order_id;
    const gstRate = parseFloat(hotelRes.rows[0].gst_percentage || 0);

    const subtotal = orderRes.rows.reduce((sum, item) => sum + (parseFloat(item.price) * parseInt(item.quantity)), 0);
    const gst = subtotal * (gstRate / 100);
    const initialTotal = subtotal + gst;
    const discount = parseFloat(discount_percentage) || 0;

    let discountAmount = 0;
    if (discount > 0) {
      if (Array.isArray(selected_discount_item_ids)) {
        const selectedSubtotal = orderRes.rows.reduce((sum, item) => {
          if (selected_discount_item_ids.includes(item.id) || selected_discount_item_ids.includes(item.menu_item_id)) {
            return sum + (parseFloat(item.price) * parseInt(item.quantity));
          }
          return sum;
        }, 0);
        const selectedTotal = selectedSubtotal * (1 + gstRate / 100);
        discountAmount = selectedTotal * (discount / 100);
      } else {
        discountAmount = initialTotal * (discount / 100);
      }
    }

    const finalAmount = Math.max(0, initialTotal - discountAmount);

    // Deduct stock from inventory
    await inventoryService.deductStockForOrder(orderId, req.user.hotel_id, client);

    const billRes = await client.query(
      `INSERT INTO bills (order_id, total_amount, gst, final_amount, discount_percentage) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orderId, subtotal, gst, finalAmount, discount]
    );

    await client.query(`UPDATE orders SET status = 'completed' WHERE id = $1`, [orderId]);
    
    await client.query('COMMIT');

    const responsePayload = {
      ...billRes.rows[0],
      discount_amount: discountAmount,
      subtotal: subtotal,
      total_amount: finalAmount,
      gst_percentage: gstRate,
      items: orderRes.rows,
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
        'SELECT mi.name, oi.quantity FROM order_items oi JOIN menu_items mi ON oi.menu_item_id = mi.id WHERE oi.order_id = $1',
        [bill.order_id]
     );
     const items = itemsRes.rows;

     // Generate Short Itemized Message
     let msg = `*--- ${hotelName.toUpperCase()} ---*\n`;
     msg += `Bill #${billId}\n`;
     items.forEach(i => msg += `${i.name} x ${i.quantity}\n`);
     msg += `Total: ₹${bill.final_amount}\n`;
     msg += `Thanks for visiting!`;

      if (method === 'whatsapp') {
         // WhatsApp is handled via Direct Link on the frontend to keep it 100% free.
         console.log(`[Notification] WhatsApp link generated for ${customerPhone}. No SMS charge triggered.`);
      } else {
         console.log(`[Notification] Non-supported notification method requested: ${method}`);
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
  const { method } = req.body; // 'upi', 'cash', 'card'
  try {
     const result = await db.query(
        'UPDATE bills SET is_paid = true, payment_method = $1 WHERE id = $2 RETURNING *',
        [method, billId]
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
    
    // Check if source has active order
    const sourceOrder = await client.query('SELECT id FROM orders WHERE table_id = $1 AND status = $2', [tableId, 'active']);
    if (sourceOrder.rows.length === 0) return res.status(400).json({ message: 'No active order to swap' });
    
    // Check if target has active order
    const targetOrder = await client.query('SELECT id FROM orders WHERE table_id = $1 AND status = $2', [targetTableId, 'active']);
    if (targetOrder.rows.length > 0) return res.status(400).json({ message: 'Target table is busy' });

    // Transfer order
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
