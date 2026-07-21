const express = require('express');
const db = require('../db/db');
const auth = require('../middleware/auth');
const router = express.Router();

// Get billing history for a hotel
router.get('/history', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT b.*, t.table_number, o.created_at as order_time,
             (
                SELECT json_group_array(json_object('name', mi.name, 'quantity', oi.quantity, 'price', mi.price))
                FROM order_items oi
                JOIN menu_items mi ON oi.menu_item_id = mi.id
                WHERE oi.order_id = b.order_id
             ) as items_json
      FROM bills b 
      JOIN orders o ON b.order_id = o.id 
      JOIN tables t ON o.table_id = t.id 
      WHERE t.hotel_id = $1 
        AND b.created_at >= datetime('now', '-1 year')
      ORDER BY b.created_at DESC`, 
      [req.user.hotel_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error retrieving billing history' });
  }
});

// Get a single bill with items
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const bill = await db.query(`
      SELECT b.*, COALESCE(t.table_number, 'Room ' || r.room_number, 'Parcel') as table_number, o.created_at as order_time,
             h.name as hotel_name, h.phone as hotel_phone, h.location as hotel_location, h.gst_percentage
      FROM bills b 
      JOIN orders o ON b.order_id = o.id 
      LEFT JOIN tables t ON o.table_id = t.id 
      LEFT JOIN rooms r ON o.room_id = r.id
      JOIN hotels h ON (t.hotel_id = h.id OR r.hotel_id = h.id)
      WHERE b.id = $1 AND h.id = $2`, 
      [id, req.user.hotel_id]
    );
    
    if (bill.rows.length === 0) return res.status(404).json({ message: 'Bill not found' });
    
    const items = await db.query(`
      SELECT oi.quantity, mi.name, mi.price 
      FROM order_items oi 
      JOIN menu_items mi ON oi.menu_item_id = mi.id 
      WHERE oi.order_id = $1`,
      [bill.rows[0].order_id]
    );
    
    res.json({
      ...bill.rows[0],
      items: items.rows,
      subtotal: items.rows.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error retrieving bill details' });
  }
});

// Update payment status
router.put('/:id/pay', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const { method } = req.body;
        const result = await db.query(
            'UPDATE bills SET is_paid = true, payment_method = $1 WHERE id = $2 RETURNING *',
            [method || 'upi', id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: 'Update failed' });
    }
});

// Trigger print job for a bill
router.post('/:id/print', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethod } = req.body || {};
    const bill = await db.query(`
      SELECT b.*, o.room_id, o.table_id,
             r.guest_name, r.check_in_date, r.booking_days, r.total_cost as room_cost,
             h.name as hotel_name, h.phone as hotel_phone, h.location as hotel_location, h.gst_percentage, h.upi_id, h.printer_size, h.fssai_number, h.email as hotel_email
      FROM bills b 
      JOIN orders o ON b.order_id = o.id 
      LEFT JOIN tables t ON o.table_id = t.id 
      LEFT JOIN rooms r ON o.room_id = r.id
      JOIN hotels h ON (t.hotel_id = h.id OR r.hotel_id = h.id)
      WHERE b.id = $1 AND h.id = $2`, 
      [id, req.user.hotel_id]
    );
    
    if (bill.rows.length === 0) return res.status(404).json({ message: 'Bill not found' });
    
    const billData = bill.rows[0];

    // Fetch items
    const items = await db.query(`
      SELECT oi.quantity, mi.name, mi.price 
      FROM order_items oi 
      JOIN menu_items mi ON oi.menu_item_id = mi.id 
      WHERE oi.order_id = $1`,
      [billData.order_id]
    );

    // Resolve table name
    let tableName = 'Parcel';
    if (billData.table_id) {
      const tableQuery = await db.query('SELECT table_number, floor FROM tables WHERE id = $1', [billData.table_id]);
      if (tableQuery.rows.length > 0) {
        const tb = tableQuery.rows[0];
        tableName = `Table ${tb.table_number} (${tb.floor || 'Floor 1'})`;
      }
    } else if (billData.room_id) {
      const roomQuery = await db.query('SELECT room_number FROM rooms WHERE id = $1', [billData.room_id]);
      if (roomQuery.rows.length > 0) {
        tableName = `Room ${roomQuery.rows[0].room_number}`;
      }
    }

    // Include room charge if applicable
    let printItems = items.rows.map(item => ({
      name: item.name,
      price: Number(item.price),
      quantity: Number(item.quantity)
    }));

    let roomCharge = 0;
    let bookingDays = 0;
    let checkInDate = null;
    let guestName = null;
    if (billData.room_id) {
      roomCharge = parseFloat(billData.room_cost || 0);
      bookingDays = parseInt(billData.booking_days || 1);
      checkInDate = billData.check_in_date;
      guestName = billData.guest_name;
    }

    const pMethod = paymentMethod || billData.payment_method || 'upi';
    const isPaid = billData.is_paid || false;
    const showUPI = !isPaid && (pMethod === 'upi' || pMethod === 'online');

    const printService = require('../services/printService');
    const payload = {
      type: 'FINAL_BILL',
      printer: 'billing',
      hotelId: Number(req.user.hotel_id),
      billId: Number(billData.id),
      table: String(tableName),
      subtotal: Number(billData.total_amount),
      gst: Number(billData.gst),
      finalAmount: Number(billData.final_amount),
      discountPercentage: Number(billData.discount_percentage || 0),
      items: printItems,
      hotelName: billData.hotel_name,
      hotelPhone: billData.hotel_phone,
      hotelLocation: billData.hotel_location,
      hotelEmail: billData.hotel_email,
      hotelFssai: billData.fssai_number,
      gst_percentage: Number(billData.gst_percentage || 0),
      upiId: showUPI ? (billData.upi_id || '') : '',
      isPaid: isPaid,
      room_charge: roomCharge,
      booking_days: bookingDays,
      guestName: guestName,
      checkInDate: checkInDate,
      printerSize: billData.printer_size || '80mm'
    };

    printService.emitPrintJob(req.user.hotel_id, payload);
    res.json({ success: true, message: 'Print job emitted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error printing bill' });
  }
});

module.exports = router;
