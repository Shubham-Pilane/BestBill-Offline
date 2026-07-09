const express = require('express');
const db = require('../db/db');
const auth = require('../middleware/auth');
const router = express.Router();
const { notifyUpdate } = require('../socket');
const inventoryService = require('../services/inventoryService');

// Get all rooms for a hotel
router.get('/', auth, async (req, res) => {
  try {
    const rooms = await db.query(
      `SELECT r.*, o.id as active_order_id, o.owner_message, o.guest_note, o.is_delivered
       FROM rooms r 
       LEFT JOIN (
           SELECT id, room_id, owner_message, guest_note, is_delivered 
           FROM orders o1
           WHERE status = 'active'
             AND id = (SELECT MAX(id) FROM orders o2 WHERE o2.room_id = o1.room_id AND o2.status = 'active')
       ) o ON o.room_id = r.id
       WHERE r.hotel_id = $1 
       ORDER BY r.floor ASC, r.room_number ASC`,
      [req.user.hotel_id]
    );
    res.json(rooms.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching rooms' });
  }
});

// NEW: Get all recent guest orders (including those from checked-out rooms)
router.get('/guest-orders-all', auth, async (req, res) => {
  try {
    const orders = await db.query(
      `SELECT 
          o.*, 
          r.room_number,
          r.guest_name,
          r.status as room_status,
          (SELECT SUM(oi.quantity * mi.price) 
           FROM order_items oi 
           JOIN menu_items mi ON oi.menu_item_id = mi.id 
           WHERE oi.order_id = o.id) as total_amount,
          (SELECT group_concat(quantity || 'x ' || name, ', ') 
           FROM order_items oi 
           JOIN menu_items mi ON oi.menu_item_id = mi.id 
           WHERE oi.order_id = o.id) as items_summary
       FROM orders o
       JOIN rooms r ON o.room_id = r.id
       WHERE r.hotel_id = $1
       AND o.source = 'guest'
       AND o.created_at >= datetime('now', '-2 days')
       AND EXISTS (SELECT 1 FROM order_items WHERE order_id = o.id)
       ORDER BY o.created_at DESC
       LIMIT 50`,
      [req.user.hotel_id]
    );
    res.json(orders.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching guest order history' });
  }
});

// Create rooms (Batch create)
router.post('/batch', auth, async (req, res) => {
  const { roomConfigs } = req.body; // roomConfigs: [{floor: 'Floor 1', count: 10}, ...]
  if (!roomConfigs || roomConfigs.length === 0) return res.status(400).json({ message: 'No room configuration provided' });
  
  try {
    for (const config of roomConfigs) {
        const { floor, count } = config;
        const floorNumStr = floor.match(/\d+/) ? floor.match(/\d+/)[0] : '1';
        const floorInt = parseInt(floorNumStr);
        
        for (let i = 1; i <= count; i++) {
            const roomNumber = `${floorInt}${i.toString().padStart(2, '0')}`;
            await db.query(
                'INSERT INTO rooms (hotel_id, room_number, floor, room_name) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', 
                [req.user.hotel_id, roomNumber, floor, roomNumber]
            );
        }
    }
    res.status(201).json({ message: 'Rooms initialized successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error initializing room infrastructure' });
  }
});

// Update room details (rename or update stay)
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { room_number, room_name, floor, status, booking_days, total_cost, guest_name, guest_phone, check_in_date } = req.body;
  try {
    const result = await db.query(
      `UPDATE rooms SET 
       room_number = COALESCE($1, room_number), 
       room_name = COALESCE($2, room_name), 
       floor = COALESCE($3, floor), 
       status = COALESCE($4, status),
       booking_days = COALESCE($5, booking_days),
       total_cost = COALESCE($6, total_cost),
       guest_name = COALESCE($7, guest_name),
       guest_phone = COALESCE($8, guest_phone),
       check_in_date = COALESCE($9, check_in_date)
       WHERE id = $10 AND hotel_id = $11 RETURNING *`,
      [room_number, room_name, floor, status, booking_days, total_cost, guest_name, guest_phone, check_in_date, id, req.user.hotel_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Room not found' });
    notifyUpdate(req.user.hotel_id, 'room-update');
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
       return res.status(400).json({ message: 'Room number already exists.' });
    }
    console.error(err);
    res.status(500).json({ message: 'Update failed' });
  }
});

// Delete room
router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM rooms WHERE id = $1 AND hotel_id = $2', [id, req.user.hotel_id]);
    notifyUpdate(req.user.hotel_id, 'room-update');
    res.json({ message: 'Room deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed' });
  }
});

// Book a room
router.post('/:id/book', auth, async (req, res) => {
    const { id } = req.params;
    const { guest_name, guest_phone, booking_days, total_cost, check_in_date } = req.body;
    try {
        await db.query('BEGIN');
        
        const checkIn = check_in_date ? new Date(check_in_date).toISOString() : new Date().toISOString();
        const result = await db.query(
            `UPDATE rooms SET 
             status = 'occupied', 
             guest_name = $1, 
             guest_phone = $2, 
             booking_days = $3, 
             total_cost = $4,
             check_in_date = $5
             WHERE id = $6 AND hotel_id = $7 RETURNING *`,
            [guest_name, guest_phone, booking_days, total_cost, checkIn, id, req.user.hotel_id]
        );

        if (result.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ message: 'Room not found' });
        }

        // Prevent duplicate active orders by completing any previous dangling ones
        await db.query("UPDATE orders SET status = 'completed' WHERE room_id = $1 AND status = 'active'", [id]);

        // Initialize active order for billing parity - matching our existing schema
        await db.query(
            "INSERT INTO orders (room_id, status, source) VALUES ($1, $2, 'admin')",
            [id, 'active']
        );

        await db.query('COMMIT');
        notifyUpdate(req.user.hotel_id, 'room-update');
        res.json(result.rows[0]);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Booking failed' });
    }
});

// Checkout / Clear room
router.post('/:id/checkout', auth, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            `UPDATE rooms SET 
             status = 'available', 
             guest_name = NULL, 
             guest_phone = NULL, 
             booking_days = 0, 
             total_cost = 0,
             check_in_date = NULL
             WHERE id = $1 AND hotel_id = $2 RETURNING *`,
            [id, req.user.hotel_id]
        );
        notifyUpdate(req.user.hotel_id, 'room-update');
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: 'Checkout failed' });
    }
});

// Get order for a room
router.get('/:roomId/order', auth, async (req, res) => {
    const { roomId } = req.params;
    try {
      const orderQuery = "SELECT * FROM orders WHERE room_id = $1 AND status = 'active'";
      const orderResult = await db.query(orderQuery, [roomId]);
      
      if (orderResult.rows.length === 0) {
        return res.json({ order: null, items: [] });
      }

      const order = orderResult.rows[0];
      const itemsQuery = `
        SELECT oi.id, oi.order_id, oi.menu_item_id, oi.quantity, mi.name, mi.price
        FROM order_items oi
        JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = $1
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
router.post('/:roomId/order/kot', auth, async (req, res) => {
  const { roomId } = req.params;
  const { waiter, notes } = req.body;
  console.log(`[KOT DEBUG] Request received for roomId: ${roomId}, user:`, req.user);
  try {
    const [hotelRes, roomRes, orderRes] = await Promise.all([
      db.query('SELECT billing_method FROM hotels WHERE id = $1', [req.user.hotel_id]),
      db.query('SELECT room_number FROM rooms WHERE id = $1', [roomId]),
      db.query(`
        SELECT o.id as order_id, oi.quantity, oi.printed_quantity, mi.name
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE o.room_id = $1 AND o.status = 'active'
      `, [roomId])
    ]);

    console.log('[KOT DEBUG] hotelRes rows:', hotelRes.rows);
    console.log('[KOT DEBUG] roomRes rows:', roomRes.rows);
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
      return res.status(400).json({ message: 'No new items to send to kitchen' });
    }

    // Update waiter name, notes, KOT timestamp and reset preparation status for kitchen queue
    await db.query(
      "UPDATE orders SET waiter_name = $1, guest_note = $2, is_prepared = false, kot_sent_at = CURRENT_TIMESTAMP WHERE id = $3", 
      [waiter || req.user.name, notes || '', orderRes.rows[0].order_id]
    );

    // Update printed_quantity = quantity for all order items of this active order
    await db.query(
      "UPDATE order_items SET printed_quantity = quantity WHERE order_id = $1",
      [orderRes.rows[0].order_id]
    );

    const printService = require('../services/printService');
    printService.sendKOT({
      hotelId: req.user.hotel_id,
      table: `Room ${roomRes.rows[0]?.room_number || roomId}`,
      waiter: waiter || req.user.name,
      items: printItems,
      notes: notes || ''
    });
    return res.json({ success: true, message: 'KOT printed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error printing KOT' });
  }
});
  
// Add item to room order
router.post('/:roomId/order', auth, async (req, res) => {
    const { menuItemId, quantity } = req.body;
    const { roomId } = req.params;
  
    try {
      // Find or create active order for the room
      let orderRes = await db.query(`SELECT id FROM orders WHERE room_id = $1 AND status = 'active'`, [roomId]);
      let orderId;
      
      if (orderRes.rows.length === 0) {
        const insertOrder = await db.query(
          `INSERT INTO orders (room_id, status, source) VALUES ($1, 'active', 'admin') RETURNING id`,
          [roomId]
        );
        orderId = insertOrder.rows[0].id;
      } else {
        orderId = orderRes.rows[0].id;
      }

      // Insert or update order item manually to avoid ON CONFLICT constraint requirements
      const existingItem = await db.query(
        `SELECT id, quantity FROM order_items WHERE order_id = $1 AND menu_item_id = $2`,
        [orderId, menuItemId]
      );
  
      if (existingItem.rows.length > 0) {
        await db.query(
          `UPDATE order_items SET quantity = quantity + $1 WHERE id = $2`,
          [quantity, existingItem.rows[0].id]
        );
      } else {
        await db.query(
          `INSERT INTO order_items (order_id, menu_item_id, quantity) VALUES ($1, $2, $3)`,
          [orderId, menuItemId, quantity]
        );
      }
  
      const query2 = `
        SELECT oi.*, mi.name, mi.price 
        FROM order_items oi 
        JOIN menu_items mi ON oi.menu_item_id = mi.id 
        WHERE oi.order_id = $1
        ORDER BY oi.created_at ASC
      `;
      const updatedItems = await db.query(query2, [orderId]);
      notifyUpdate(req.user.hotel_id, 'room-update');
      res.json({ items: updatedItems.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error adding item' });
    }
});

// Update item quantity
router.put('/:roomId/order/items/:itemId', auth, async (req, res) => {
    const { quantity } = req.body;
    const { itemId } = req.params;
    try {
      const query1 = `UPDATE order_items SET quantity = $1 WHERE id = $2 RETURNING order_id`;
      const res1 = await db.query(query1, [quantity, itemId]);
      
      if (res1.rows.length === 0) return res.status(404).json({ message: 'Item not found' });
      const orderId = res1.rows[0].order_id;
  
      const query2 = `
        SELECT oi.*, mi.name, mi.price 
        FROM order_items oi 
        JOIN menu_items mi ON oi.menu_item_id = mi.id 
        WHERE oi.order_id = $1
        ORDER BY oi.created_at ASC
      `;
      const updatedItems = await db.query(query2, [orderId]);
      notifyUpdate(req.user.hotel_id, 'room-update');
      res.json({ items: updatedItems.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Update failed' });
    }
});

// Delete item
router.delete('/:roomId/order/items/:itemId', auth, async (req, res) => {
    const { itemId, roomId } = req.params;
    
    try {
      // 1. Delete the item and get its order_id
      const deleteRes = await db.query('DELETE FROM order_items WHERE id = $1 RETURNING order_id', [itemId]);
      
      if (deleteRes.rows.length === 0) {
        // Already deleted, check if order still exists
        const orderCheck = await db.query('SELECT id FROM orders WHERE room_id = $1 AND status = $2', [roomId, 'active']);
        if (orderCheck.rows.length === 0) return res.json({ items: [], order_deleted: true });
        
        const currentItems = await db.query(`
          SELECT oi.*, mi.name, mi.price FROM order_items oi 
          JOIN menu_items mi ON oi.menu_item_id = mi.id 
          WHERE oi.order_id = $1 ORDER BY oi.created_at ASC
        `, [orderCheck.rows[0].id]);
        return res.json({ items: currentItems.rows, order_deleted: false });
      }

      const orderId = deleteRes.rows[0].order_id;
      const updatedItems = await db.query(`
        SELECT oi.*, mi.name, mi.price FROM order_items oi 
        JOIN menu_items mi ON oi.menu_item_id = mi.id 
        WHERE oi.order_id = $1 ORDER BY oi.created_at ASC
      `, [orderId]);

      notifyUpdate(req.user.hotel_id, 'room-update');
      res.json({ items: updatedItems.rows, order_deleted: false });
    } catch (err) {
      console.error('Room Delete error:', err);
      res.status(500).json({ message: 'Removal failed' });
    }
});

// Generate Room Bill
router.post('/:roomId/bill', auth, async (req, res) => {
    const { roomId } = req.params;
    const { discount_percentage } = req.body;
    
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const [hotelRes, roomRes, activeOrderRes] = await Promise.all([
        client.query('SELECT name, phone, location, gst_percentage, billing_method FROM hotels WHERE id = $1', [req.user.hotel_id]),
        client.query('SELECT * FROM rooms WHERE id = $1', [roomId]),
        client.query("SELECT id FROM orders WHERE room_id = $1 AND status = 'active' ORDER BY id DESC LIMIT 1", [roomId])
      ]);
  
      if (activeOrderRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'No active order found' });
      }
      
      const orderId = activeOrderRes.rows[0].id;
      
      const orderItemsQuery = await client.query(`
        SELECT oi.quantity, mi.name, mi.price
        FROM order_items oi
        JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = $1
      `, [orderId]);

      const orderItems = orderItemsQuery.rows;
      const gstRate = parseFloat(hotelRes.rows[0].gst_percentage || 0);
      const room = roomRes.rows[0];
      const roomCharge = parseFloat(room.total_cost || 0);
  
      const foodSubtotal = orderItems.reduce((sum, item) => sum + (parseFloat(item.price) * parseInt(item.quantity)), 0);
      const subtotal = foodSubtotal + roomCharge;
      const gst = subtotal * (gstRate / 100);
      const initialTotal = subtotal + gst;
      const discount = parseFloat(discount_percentage) || 0;
      const finalAmount = initialTotal - (initialTotal * (discount / 100));
 
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
        subtotal: subtotal,
        final_amount: finalAmount,
        room_charge: roomCharge,
        guest_name: room.guest_name,
        room_number: room.room_number,
        gst_percentage: gstRate,
        items: orderItems, 
        hotel_name: hotelRes.rows[0].name,
        hotel_phone: hotelRes.rows[0].phone,
        hotel_location: hotelRes.rows[0].location
      };
 
      notifyUpdate(req.user.hotel_id, 'room-update');
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
router.delete('/:roomId/bill/:billId', auth, async (req, res) => {
    const { billId } = req.params;
    try {
      const billCheck = await db.query('SELECT order_id FROM bills WHERE id = $1', [billId]);
      if (billCheck.rows.length === 0) return res.status(404).json({ message: 'Bill not found or could not be rolled back' });
      const orderId = billCheck.rows[0].order_id;

      const orderCheck = await db.query('SELECT room_id FROM orders WHERE id = $1', [orderId]);
      const roomId = orderCheck.rows[0]?.room_id;

      await db.query('DELETE FROM bills WHERE id = $1', [billId]);
      await db.query("UPDATE orders SET status = 'active' WHERE id = $1", [orderId]);
      if (roomId) {
        await db.query("UPDATE rooms SET status = 'occupied' WHERE id = $1", [roomId]);
      }
      notifyUpdate(req.user.hotel_id, 'room-update');
  
      res.json({ message: 'Bill rolled back, order is active again' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Rollback failed' });
    }
});

// Send message to guest order
router.put('/orders/:orderId/message', auth, async (req, res) => {
  const { orderId } = req.params;
  const { message } = req.body;
  try {
    await db.query('UPDATE orders SET owner_message = $1 WHERE id = $2', [message, orderId]);
    res.json({ success: true, message: 'Message transmitted to guest' });
  } catch (err) {
    res.status(500).json({ message: 'Error sending message' });
  }
});

// Mark guest order as delivered
router.put('/orders/:orderId/deliver', auth, async (req, res) => {
  const { orderId } = req.params;
  try {
    await db.query('UPDATE orders SET is_delivered = true WHERE id = $1', [orderId]);
    res.json({ success: true, message: 'Order marked as delivered' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating delivery status' });
  }
});

// Owner View Chat History
router.get('/orders/:orderId/chat', auth, async (req, res) => {
  try {
    const chats = await db.query(
      'SELECT * FROM order_chats WHERE order_id = $1 ORDER BY created_at ASC',
      [req.params.orderId]
    );
    res.json(chats.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching chat' });
  }
});

// Owner Send Reply
router.post('/orders/:orderId/chat', auth, async (req, res) => {
  try {
    const { message } = req.body;
    await db.query(
      'INSERT INTO order_chats (order_id, sender, message) VALUES ($1, $2, $3)',
      [req.params.orderId, 'owner', message]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Error sending reply' });
  }
});

module.exports = router;
