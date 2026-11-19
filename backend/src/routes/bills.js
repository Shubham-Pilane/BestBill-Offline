const express = require('express');
const db = require('../db/db');
const auth = require('../middleware/auth');
const router = express.Router();
const { notifyUpdate } = require('../socket');
const inventoryService = require('../services/inventoryService');
const inventoryRepository = require('../repositories/inventoryRepository');

// Get billing history for a hotel
router.get('/history', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT b.*, t.table_number, o.created_at as order_time,
             (
                SELECT json_group_array(json_object('name', COALESCE(oi.custom_name, mi.name, 'Other'), 'marathi_name', mi.marathi_name, 'quantity', oi.quantity, 'price', COALESCE(oi.custom_price, mi.price, 0), 'notes', oi.notes))
                FROM order_items oi
                LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
                WHERE oi.order_id = b.order_id AND oi.quantity > 0
                ORDER BY COALESCE(oi.sequence, 0) ASC, oi.created_at ASC
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

// Helper to compute effective tax rates for an existing bill
function resolveEffectiveTaxRates(billRow) {
  const hotelGstRate = Number(billRow.gst_percentage || 0);
  const hotelCgstRate = Number(billRow.cgst_percentage || 0);
  const hotelSgstRate = Number(billRow.sgst_percentage || 0);
  const oldTotalAmt = Number(billRow.total_amount || 0);
  const oldGst = Number(billRow.gst || 0);
  const oldCgst = Number(billRow.cgst || 0);
  const oldSgst = Number(billRow.sgst || 0);

  let gstRate = hotelGstRate;
  if (oldTotalAmt > 0 && oldGst === 0) {
    gstRate = 0;
  } else if (oldGst > 0 && oldTotalAmt > 0 && hotelGstRate === 0) {
    gstRate = Number(((oldGst / oldTotalAmt) * 100).toFixed(2));
  }

  let cgstRate = hotelCgstRate;
  if (oldTotalAmt > 0 && oldCgst === 0) {
    cgstRate = 0;
  } else if (oldCgst > 0 && oldTotalAmt > 0 && hotelCgstRate === 0) {
    cgstRate = Number(((oldCgst / oldTotalAmt) * 100).toFixed(2));
  }

  let sgstRate = hotelSgstRate;
  if (oldTotalAmt > 0 && oldSgst === 0) {
    sgstRate = 0;
  } else if (oldSgst > 0 && oldTotalAmt > 0 && hotelSgstRate === 0) {
    sgstRate = Number(((oldSgst / oldTotalAmt) * 100).toFixed(2));
  }

  return { gstRate, cgstRate, sgstRate };
}

// Helper to fetch full bill payload by ID
async function getFullBillById(billId, hotelId, queryRunner = db) {
  const bill = await queryRunner.query(`
    SELECT b.*, COALESCE(t.table_number, 'Room ' || r.room_number, 'Parcel') as table_number, o.created_at as order_time,
           o.room_id, o.table_id, r.total_cost as room_cost,
           h.name as hotel_name, h.phone as hotel_phone, h.location as hotel_location, h.gst_percentage, h.cgst_percentage, h.sgst_percentage
    FROM bills b 
    JOIN orders o ON b.order_id = o.id 
    LEFT JOIN tables t ON o.table_id = t.id 
    LEFT JOIN rooms r ON o.room_id = r.id
    JOIN hotels h ON (t.hotel_id = h.id OR r.hotel_id = h.id)
    WHERE b.id = $1 AND h.id = $2`, 
    [billId, hotelId]
  );

  if (bill.rows.length === 0) return null;
  const billRow = bill.rows[0];

  const items = await queryRunner.query(`
    SELECT oi.id, oi.menu_item_id, oi.quantity, oi.is_manual, oi.custom_name, oi.custom_price, oi.notes, oi.sequence,
           COALESCE(oi.custom_name, mi.name, 'Other') as name, mi.marathi_name, COALESCE(oi.custom_price, mi.price, 0) as price 
    FROM order_items oi 
    LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id 
    WHERE oi.order_id = $1 AND oi.quantity > 0
    ORDER BY COALESCE(oi.sequence, 0) ASC, oi.created_at ASC, oi.id ASC`,
    [billRow.order_id]
  );

  const roomCharge = billRow.room_id ? Number(billRow.room_cost || 0) : 0;
  const itemsSubtotal = items.rows.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
  const subtotal = items.rows.length > 0
    ? Number((itemsSubtotal + roomCharge).toFixed(2))
    : Number(billRow.total_amount || 0);
  const { gstRate, cgstRate, sgstRate } = resolveEffectiveTaxRates(billRow);
  const roundOffVal = Number(billRow.round_off || 0);
  const discountAmount = Math.max(0, Number(((subtotal + Number(billRow.gst || 0) + Number(billRow.cgst || 0) + Number(billRow.sgst || 0)) - (Number(billRow.final_amount || 0) - roundOffVal)).toFixed(2)));

  return {
    ...billRow,
    room_charge: roomCharge,
    items: items.rows,
    subtotal,
    discount_amount: discountAmount,
    effective_gst_percentage: gstRate,
    effective_cgst_percentage: cgstRate,
    effective_sgst_percentage: sgstRate
  };
}

// Get a single bill with items
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const payload = await getFullBillById(id, req.user.hotel_id);
    if (!payload) return res.status(404).json({ message: 'Bill not found' });
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error retrieving bill details' });
  }
});

// Edit / Update an existing bill's items, prices, quantities, discount, and totals
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { items, discount_percentage, discount_type, discount_amount, discount_value } = req.body || {};

  if (!Array.isArray(items)) {
    return res.status(400).json({ message: 'Items array is required' });
  }

  const normalizedItems = items
    .map(item => ({
      menu_item_id: item.menu_item_id ? parseInt(item.menu_item_id, 10) : null,
      name: String(item.name || 'Other').trim() || 'Other',
      price: Math.max(0, parseFloat(item.price) || 0),
      quantity: parseInt(item.quantity, 10) || 0,
      is_manual: Boolean(item.is_manual)
    }))
    .filter(item => item.quantity > 0);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const billRes = await client.query(`
      SELECT b.*, o.id as resolved_order_id, o.room_id, o.table_id, r.total_cost as room_cost, 
             h.gst_percentage, h.cgst_percentage, h.sgst_percentage
      FROM bills b
      JOIN orders o ON b.order_id = o.id
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN rooms r ON o.room_id = r.id
      JOIN hotels h ON (t.hotel_id = h.id OR r.hotel_id = h.id)
      WHERE b.id = $1 AND h.id = $2`,
      [id, req.user.hotel_id]
    );

    if (billRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Bill not found' });
    }

    const billRow = billRes.rows[0];
    const orderId = billRow.resolved_order_id;
    const roomCharge = billRow.room_id ? Number(billRow.room_cost || 0) : 0;

    if (normalizedItems.length === 0 && roomCharge <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Bill must contain at least one item' });
    }

    // Reverse any prior inventory SALE transactions for this order before replacing items
    const oldSaleTxs = await client.query(
      `SELECT id, inventory_item_id, quantity
       FROM stock_transactions
       WHERE hotel_id = $1 AND reference_type = 'orders' AND reference_id = $2 AND transaction_type = 'SALE'`,
      [req.user.hotel_id, orderId]
    );

    if (oldSaleTxs.rows.length > 0) {
      for (const tx of oldSaleTxs.rows) {
        await inventoryRepository.updateStock(req.user.hotel_id, tx.inventory_item_id, -Number(tx.quantity), client);
      }
      await client.query(
        `DELETE FROM stock_transactions
         WHERE hotel_id = $1 AND reference_type = 'orders' AND reference_id = $2 AND transaction_type = 'SALE'`,
        [req.user.hotel_id, orderId]
      );
    }

    // Replace order_items for this order cleanly
    await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);

    // Merge identical menu items that share the same price; any conflicting duplicate becomes manual
    const dedupedItems = [];
    const seenMenuIdx = new Map();
    for (const item of normalizedItems) {
      if (!item.is_manual && item.menu_item_id) {
        if (seenMenuIdx.has(item.menu_item_id)) {
          const existingIdx = seenMenuIdx.get(item.menu_item_id);
          if (Math.abs(dedupedItems[existingIdx].price - item.price) < 0.001) {
            dedupedItems[existingIdx].quantity += item.quantity;
          } else {
            dedupedItems.push({ ...item, menu_item_id: null, is_manual: true });
          }
        } else {
          seenMenuIdx.set(item.menu_item_id, dedupedItems.length);
          dedupedItems.push({ ...item });
        }
      } else {
        dedupedItems.push({ ...item, menu_item_id: null, is_manual: true });
      }
    }

    for (const item of dedupedItems) {
      if (!item.is_manual && item.menu_item_id) {
        const menuRes = await client.query('SELECT id, name, price FROM menu_items WHERE id = $1', [item.menu_item_id]);
        if (menuRes.rows.length > 0) {
          const menuRow = menuRes.rows[0];
          const customName = item.name !== String(menuRow.name || '').trim() ? item.name : null;
          await client.query(
            `INSERT INTO order_items (order_id, menu_item_id, quantity, max_quantity, printed_quantity, is_manual, custom_name, custom_price)
             VALUES ($1, $2, $3, $3, $3, false, $4, $5)`,
            [orderId, menuRow.id, item.quantity, customName, item.price]
          );
          continue;
        }
      }

      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, max_quantity, printed_quantity, is_manual, custom_name, custom_price)
         VALUES ($1, NULL, $2, $2, $2, true, $3, $4)`,
        [orderId, item.quantity, item.name, item.price]
      );
    }

    // Re-deduct inventory stock for updated order items if recipes are mapped
    await inventoryService.deductStockForOrder(orderId, req.user.hotel_id, client);

    const foodSubtotal = dedupedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const subtotal = Number((foodSubtotal + roomCharge).toFixed(2));
    const { gstRate, cgstRate, sgstRate } = resolveEffectiveTaxRates(billRow);
    const gst = Number(((subtotal * gstRate) / 100).toFixed(2));
    const cgst = Number(((subtotal * cgstRate) / 100).toFixed(2));
    const sgst = Number(((subtotal * sgstRate) / 100).toFixed(2));
    const initialTotal = subtotal + gst + cgst + sgst;
    const discType = discount_type || billRow.discount_type || 'percentage';
    let discountPct = 0;
    let discountAmount = 0;
    if (discType === 'amount') {
      const fixedAmt = discount_amount !== undefined ? parseFloat(discount_amount) : (discount_value !== undefined ? parseFloat(discount_value) : parseFloat(billRow.discount_amount || 0));
      discountAmount = Math.max(0, Math.min(initialTotal, Number(fixedAmt || 0)));
      discountPct = initialTotal > 0 ? Number(((discountAmount / initialTotal) * 100).toFixed(2)) : 0;
    } else {
      discountPct = discount_percentage !== undefined
        ? Math.max(0, Math.min(100, parseFloat(discount_percentage) || 0))
        : Number(billRow.discount_percentage || 0);
      discountAmount = Number((initialTotal * (discountPct / 100)).toFixed(2));
    }
    const unroundedTotal = Math.max(0, Number((initialTotal - discountAmount).toFixed(2)));
    const finalAmount = Math.ceil(unroundedTotal);
    let roundOff = Number((finalAmount - unroundedTotal).toFixed(2));
    if (roundOff < 0.001 || roundOff >= 1) {
      roundOff = 0;
    }

    const payMethod = (billRow.payment_method || '').toLowerCase();
    let updatedCash = null;
    let updatedOnline = null;

    if (payMethod === 'cash') {
      updatedCash = finalAmount;
      updatedOnline = 0;
    } else if (payMethod === 'upi' || payMethod === 'online' || payMethod === 'card') {
      updatedOnline = finalAmount;
      updatedCash = 0;
    } else if (payMethod === 'partial') {
      const reqCash = req.body.cash_amount !== undefined && req.body.cash_amount !== null ? parseFloat(req.body.cash_amount) : null;
      const reqOnline = req.body.online_amount !== undefined && req.body.online_amount !== null ? parseFloat(req.body.online_amount) : null;

      if (reqCash !== null && reqOnline !== null && !isNaN(reqCash) && !isNaN(reqOnline) && Math.abs((reqCash + reqOnline) - finalAmount) < 0.01) {
        updatedCash = Math.max(0, reqCash);
        updatedOnline = Math.max(0, reqOnline);
      } else if (reqCash !== null && !isNaN(reqCash) && reqCash >= 0 && reqCash <= finalAmount) {
        updatedCash = reqCash;
        updatedOnline = Math.max(0, Number((finalAmount - reqCash).toFixed(2)));
      } else if (reqOnline !== null && !isNaN(reqOnline) && reqOnline >= 0 && reqOnline <= finalAmount) {
        updatedOnline = reqOnline;
        updatedCash = Math.max(0, Number((finalAmount - reqOnline).toFixed(2)));
      } else {
        // Proportional rebalancing based on previous cash/online split
        const oldFinal = Number(billRow.final_amount || 0);
        const oldCash = Number(billRow.cash_amount || 0);
        if (oldFinal > 0 && oldCash > 0) {
          const ratio = Math.min(1, Math.max(0, oldCash / oldFinal));
          updatedCash = Math.round(finalAmount * ratio);
          updatedOnline = Math.max(0, Number((finalAmount - updatedCash).toFixed(2)));
        } else {
          updatedCash = Math.round(finalAmount / 2);
          updatedOnline = Math.max(0, Number((finalAmount - updatedCash).toFixed(2)));
        }
      }
    }

    await client.query(
      `UPDATE bills
       SET total_amount = $1, gst = $2, cgst = $3, sgst = $4, round_off = $5, final_amount = $6,
           discount_percentage = $7, discount_type = $8, discount_amount = $9,
           cash_amount = COALESCE($10, cash_amount),
           online_amount = COALESCE($11, online_amount)
       WHERE id = $12`,
      [subtotal, gst, cgst, sgst, roundOff, finalAmount, discountPct, discType, discountAmount, updatedCash, updatedOnline, id]
    );

    // Keep linked credit record synchronized with updated bill total
    const creditRows = await client.query('SELECT id, paid_amount FROM credits WHERE bill_id = $1', [id]);
    for (const cr of creditRows.rows) {
      const paidAmt = Number(cr.paid_amount || 0);
      const newStatus = paidAmt >= finalAmount ? 'settled' : (paidAmt > 0 ? 'partial' : 'pending');
      await client.query(
        'UPDATE credits SET amount = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [finalAmount, newStatus, cr.id]
      );
    }

    await client.query('COMMIT');

    const updatedPayload = await getFullBillById(id, req.user.hotel_id);
    notifyUpdate(req.user.hotel_id, 'table-update');
    res.json(updatedPayload);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[BILL EDIT ERROR]', err);
    if (err.message && err.message.includes('Insufficient stock')) {
      return res.status(400).json({ message: `Ingredients added to this dish in inventory are not enough to make this dish. ${err.message}` });
    }
    res.status(500).json({ message: 'Failed to update bill', error: err.message });
  } finally {
    client.release();
  }
});

// Update payment status
router.put('/:id/pay', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const { method, cash_amount, online_amount } = req.body || {};
        let cashVal = parseFloat(cash_amount || 0);
        let onlineVal = parseFloat(online_amount || 0);
        if (method === 'cash') {
          const bRes = await db.query('SELECT final_amount FROM bills WHERE id = $1', [id]);
          cashVal = parseFloat(bRes.rows[0]?.final_amount || 0);
          onlineVal = 0;
        } else if (method === 'upi' || method === 'online') {
          const bRes = await db.query('SELECT final_amount FROM bills WHERE id = $1', [id]);
          onlineVal = parseFloat(bRes.rows[0]?.final_amount || 0);
          cashVal = 0;
        }
        const result = await db.query(
            'UPDATE bills SET is_paid = true, payment_method = $1, cash_amount = $2, online_amount = $3 WHERE id = $4 RETURNING *',
            [method || 'upi', cashVal, onlineVal, id]
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
    const { paymentMethod, cash_amount, online_amount, cashAmount, onlineAmount } = req.body || {};
    const bill = await db.query(`
      SELECT b.*, o.room_id, o.table_id,
             r.guest_name, r.check_in_date, r.booking_days, r.total_cost as room_cost,
             h.name as hotel_name, h.phone as hotel_phone, h.location as hotel_location, 
             h.gst_percentage, h.cgst_percentage, h.sgst_percentage, h.upi_id, h.printer_size, h.fssai_number, h.email as hotel_email
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
      SELECT oi.quantity, oi.notes, COALESCE(oi.custom_name, mi.name, 'Other') as name, mi.marathi_name, COALESCE(oi.custom_price, mi.price, 0) as price 
      FROM order_items oi 
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id 
      WHERE oi.order_id = $1 AND oi.quantity > 0
      ORDER BY COALESCE(oi.sequence, 0) ASC, oi.created_at ASC`,
      [billData.order_id]
    );

    const userQuery = await db.query('SELECT app_language, print_lang_bill FROM users WHERE id = $1', [req.user.id]);
    let printLangBill = userQuery.rows[0]?.print_lang_bill || 'en';
    const appLang = userQuery.rows[0]?.app_language || 'en';
    if (appLang === 'en') printLangBill = 'en';
    if (appLang === 'mr') printLangBill = 'mr';

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
      name: printLangBill === 'mr' ? (item.marathi_name || item.name) : item.name,
      price: Number(item.price),
      quantity: Number(item.quantity),
      notes: item.notes || ''
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

    let finalCash = parseFloat(cash_amount !== undefined ? cash_amount : (cashAmount !== undefined ? cashAmount : (billData.cash_amount || 0)));
    let finalOnline = parseFloat(online_amount !== undefined ? online_amount : (onlineAmount !== undefined ? onlineAmount : (billData.online_amount || 0)));
    if (paymentMethod === 'cash') {
      finalCash = Number(billData.final_amount);
      finalOnline = 0;
    } else if (paymentMethod === 'upi' || paymentMethod === 'online') {
      finalOnline = Number(billData.final_amount);
      finalCash = 0;
    }

    if (paymentMethod) {
      try {
        await db.query(
          'UPDATE bills SET payment_method = $1, cash_amount = $2, online_amount = $3 WHERE id = $4',
          [paymentMethod, finalCash, finalOnline, id]
        );
      } catch (e) {}
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
      cgst: Number(billData.cgst || 0),
      sgst: Number(billData.sgst || 0),
      roundOff: Number(billData.round_off || 0),
      finalAmount: Number(billData.final_amount),
      discountPercentage: Number(billData.discount_percentage || 0),
      discountType: billData.discount_type || 'percentage',
      discountAmount: Number(billData.discount_amount || 0),
      items: printItems,
      hotelName: billData.hotel_name,
      hotelPhone: billData.hotel_phone,
      hotelLocation: billData.hotel_location,
      hotelEmail: billData.hotel_email,
      hotelFssai: billData.fssai_number,
      paymentMethod: pMethod,
      cashAmount: finalCash,
      onlineAmount: finalOnline,
      gst_percentage: Number(billData.gst_percentage || 0),
      cgst_percentage: Number(billData.cgst_percentage || 0),
      sgst_percentage: Number(billData.sgst_percentage || 0),
      upiId: showUPI ? (billData.upi_id || '') : '',
      isPaid: isPaid,
      room_charge: roomCharge,
      booking_days: bookingDays,
      guestName: guestName,
      checkInDate: checkInDate,
      printerSize: billData.printer_size || '80mm',
      notes: (billData.notes || '').trim(),
      lang: printLangBill
    };

    printService.emitPrintJob(req.user.hotel_id, payload);
    res.json({ success: true, message: 'Print job emitted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error printing bill' });
  }
});

module.exports = router;
