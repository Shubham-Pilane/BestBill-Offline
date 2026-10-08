const db = require('../db/db');

class CreditRepository {
  async saveCreditTransaction(hotelId, data, client) {
    const q = client || db;
    const { bill_id, party_type, vendor_id, customer_name, customer_phone, amount } = data;

    // 1. Create credit record
    const res = await q.query(
      `INSERT INTO credits (hotel_id, bill_id, party_type, vendor_id, customer_name, customer_phone, amount, paid_amount, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'pending') RETURNING *`,
      [hotelId, bill_id || null, party_type, vendor_id || null, customer_name || null, customer_phone || null, amount]
    );

    // 2. Mark corresponding bill as unpaid credit bill if bill_id exists
    if (bill_id) {
      await q.query(
        `UPDATE bills SET is_paid = false, payment_method = 'credit' WHERE id = $1`,
        [bill_id]
      );
    }

    return res.rows[0];
  }

  async getDashboardSummary(hotelId) {
    const [custRes, vendRes, outstandingRes, settledRes] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(amount - COALESCE(paid_amount, 0)), 0) as amt FROM credits 
         WHERE hotel_id = $1 AND party_type = 'customer' AND status != 'settled'`,
        [hotelId]
      ),
      db.query(
        `SELECT COALESCE(SUM(amount - COALESCE(paid_amount, 0)), 0) as amt FROM credits 
         WHERE hotel_id = $1 AND party_type = 'vendor' AND status != 'settled'`,
        [hotelId]
      ),
      db.query(
        `SELECT COALESCE(SUM(amount - COALESCE(paid_amount, 0)), 0) as amt FROM credits 
         WHERE hotel_id = $1 AND status != 'settled'`,
        [hotelId]
      ),
      db.query(
        `SELECT COALESCE(SUM(COALESCE(paid_amount, 0)), 0) as amt FROM credits 
         WHERE hotel_id = $1`,
        [hotelId]
      )
    ]);

    return {
      customerOutstandingAmount: Math.max(0, parseFloat(Number(custRes.rows[0]?.amt || 0).toFixed(2))),
      vendorOutstandingAmount: Math.max(0, parseFloat(Number(vendRes.rows[0]?.amt || 0).toFixed(2))),
      totalOutstandingAmount: Math.max(0, parseFloat(Number(outstandingRes.rows[0]?.amt || 0).toFixed(2))),
      totalSettledAmount: parseFloat(Number(settledRes.rows[0]?.amt || 0).toFixed(2))
    };
  }

  async getCustomerAccounts(hotelId, search = '') {
    let queryStr = `
      SELECT 
        c.customer_phone,
        MAX(c.customer_name) as customer_name,
        COUNT(c.id) as total_bills,
        SUM(c.amount) as total_credit,
        SUM(COALESCE(c.paid_amount, 0)) as total_paid,
        SUM(c.amount - COALESCE(c.paid_amount, 0)) as remaining_balance,
        MAX(c.created_at) as last_transaction_date,
        CASE 
          WHEN SUM(c.amount - COALESCE(c.paid_amount, 0)) <= 0 THEN 'settled'
          WHEN SUM(COALESCE(c.paid_amount, 0)) > 0 THEN 'partial'
          ELSE 'pending'
        END as status
      FROM credits c
      WHERE c.hotel_id = $1 AND c.party_type = 'customer' AND c.customer_phone IS NOT NULL AND c.customer_phone != ''
    `;
    const params = [hotelId];
    let paramIndex = 2;

    if (search && search.trim()) {
      const pattern = `%${search.trim()}%`;
      queryStr += ` AND (c.customer_name LIKE $${paramIndex} OR c.customer_phone LIKE $${paramIndex + 1})`;
      params.push(pattern, pattern);
      paramIndex += 2;
    }

    queryStr += ` GROUP BY c.customer_phone ORDER BY remaining_balance DESC, last_transaction_date DESC`;

    const res = await db.query(queryStr, params);
    return res.rows.map(row => ({
      ...row,
      total_credit: Number(row.total_credit || 0),
      total_paid: Number(row.total_paid || 0),
      remaining_balance: Math.max(0, Number(row.remaining_balance || 0)),
      total_bills: Number(row.total_bills || 0)
    }));
  }

  async getCustomerLookup(hotelId, phone) {
    if (!phone) return null;
    const res = await db.query(
      `SELECT customer_name, customer_phone FROM credits WHERE hotel_id = $1 AND customer_phone = $2 AND party_type = 'customer' ORDER BY id DESC LIMIT 1`,
      [hotelId, phone]
    );
    return res.rows[0] || null;
  }

  async getCustomerDetails(hotelId, phone) {
    const creditsRes = await db.query(
      `SELECT c.*, b.created_at as bill_date
       FROM credits c
       LEFT JOIN bills b ON c.bill_id = b.id
       WHERE c.hotel_id = $1 AND c.customer_phone = $2 AND c.party_type = 'customer'
       ORDER BY c.created_at DESC`,
      [hotelId, phone]
    );

    if (creditsRes.rows.length === 0) return null;

    let totalCredit = 0;
    let totalPaid = 0;
    const transactions = [];

    for (const c of creditsRes.rows) {
      const amt = Number(c.amount || 0);
      const paid = Number(c.paid_amount || 0);
      totalCredit += amt;
      totalPaid += paid;

      const paymentsRes = await db.query(
        `SELECT * FROM credit_payments WHERE credit_id = $1 ORDER BY created_at ASC`,
        [c.id]
      );

      let items = [];
      if (c.bill_id) {
        const billRes = await db.query('SELECT order_id FROM bills WHERE id = $1', [c.bill_id]);
        if (billRes.rows[0]?.order_id) {
          const itemsRes = await db.query(
            `SELECT oi.quantity, COALESCE(oi.custom_name, mi.name, 'Other') as name, COALESCE(oi.custom_price, mi.price, 0) as price 
             FROM order_items oi 
             LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id 
             WHERE oi.order_id = $1 AND oi.quantity > 0`,
            [billRes.rows[0].order_id]
          );
          items = itemsRes.rows;
        }
      }

      transactions.push({
        ...c,
        amount: amt,
        paid_amount: paid,
        remaining_amount: Math.max(0, parseFloat((amt - paid).toFixed(2))),
        payments: paymentsRes.rows,
        items
      });
    }

    const customerName = creditsRes.rows[0]?.customer_name || 'Customer';
    const remainingBalance = Math.max(0, parseFloat((totalCredit - totalPaid).toFixed(2)));

    return {
      customer_phone: phone,
      customer_name: customerName,
      total_credit: parseFloat(totalCredit.toFixed(2)),
      total_paid: parseFloat(totalPaid.toFixed(2)),
      remaining_balance: remainingBalance,
      status: remainingBalance <= 0 ? 'settled' : (totalPaid > 0 ? 'partial' : 'pending'),
      transactions
    };
  }

  async settleCustomerAccount(hotelId, phone, amountPaid, method = 'cash', notes = '') {
    let remainingToPay = Number(amountPaid || 0);
    if (isNaN(remainingToPay) || remainingToPay <= 0) return { error: 'Invalid payment amount' };

    const openCreditsRes = await db.query(
      `SELECT * FROM credits 
       WHERE hotel_id = $1 AND customer_phone = $2 AND party_type = 'customer' AND status != 'settled'
       ORDER BY created_at ASC`,
      [hotelId, phone]
    );

    let totalApplied = 0;

    for (const c of openCreditsRes.rows) {
      if (remainingToPay <= 0) break;

      const creditAmt = Number(c.amount || 0);
      const currPaid = Number(c.paid_amount || 0);
      const creditRem = Math.max(0, creditAmt - currPaid);

      if (creditRem <= 0) continue;

      const paymentForThisCredit = Math.min(remainingToPay, creditRem);
      const newPaidAmount = currPaid + paymentForThisCredit;
      const isFullyPaid = newPaidAmount >= creditAmt;
      const newStatus = isFullyPaid ? 'settled' : 'partial';

      await db.query(
        `INSERT INTO credit_payments (hotel_id, credit_id, amount_paid, payment_method, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [hotelId, c.id, paymentForThisCredit, method, notes || 'Customer account settlement']
      );

      await db.query(
        `UPDATE credits SET paid_amount = $1, status = $2, settled_at = $3, settlement_payment_method = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5`,
        [newPaidAmount, newStatus, isFullyPaid ? new Date().toISOString() : c.settled_at, method, c.id]
      );

      if (isFullyPaid && c.bill_id) {
        await db.query('UPDATE bills SET is_paid = true, payment_method = $1 WHERE id = $2', [method, c.bill_id]);
      }

      remainingToPay -= paymentForThisCredit;
      totalApplied += paymentForThisCredit;
    }

    return { success: true, amount_applied: totalApplied, remaining_to_pay: remainingToPay };
  }

  async getCreditsList(hotelId, filters = {}) {
    const { party_type, status, date_filter, startDate, endDate, search } = filters;
    
    let queryStr = `
      SELECT c.*, s.name as vendor_name, s.phone as vendor_phone
      FROM credits c
      LEFT JOIN suppliers s ON c.vendor_id = s.id
      WHERE c.hotel_id = $1
    `;
    const params = [hotelId];
    let paramIndex = 2;

    if (party_type && party_type !== 'all') {
      queryStr += ` AND c.party_type = $${paramIndex++}`;
      params.push(party_type);
    }

    if (status && status !== 'all') {
      queryStr += ` AND c.status = $${paramIndex++}`;
      params.push(status);
    }

    if (date_filter) {
      if (date_filter === 'today') {
        queryStr += ` AND date(c.created_at) = date('now', 'localtime')`;
      } else if (date_filter === 'week') {
        queryStr += ` AND date(c.created_at) >= date('now', '-7 days', 'localtime')`;
      } else if (date_filter === 'month') {
        queryStr += ` AND date(c.created_at) >= date('now', 'start of month', 'localtime')`;
      } else if (date_filter === 'custom' && startDate && endDate) {
        queryStr += ` AND date(c.created_at) >= date($${paramIndex++}) AND date(c.created_at) <= date($${paramIndex++})`;
        params.push(startDate, endDate);
      }
    }

    if (search) {
      const searchPattern = `%${search}%`;
      queryStr += ` AND (
        c.customer_name LIKE $${paramIndex} OR 
        c.customer_phone LIKE $${paramIndex + 1} OR 
        s.name LIKE $${paramIndex + 2} OR 
        s.phone LIKE $${paramIndex + 3} OR 
        CAST(c.bill_id AS TEXT) LIKE $${paramIndex + 4}
      )`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      paramIndex += 5;
    }

    queryStr += ' ORDER BY c.status ASC, c.created_at DESC';

    const res = await db.query(queryStr, params);
    return res.rows.map(c => {
      const amt = Number(c.amount || 0);
      const paid = Number(c.paid_amount || 0);
      return {
        ...c,
        amount: amt,
        paid_amount: paid,
        remaining_amount: Math.max(0, parseFloat((amt - paid).toFixed(2)))
      };
    });
  }

  async getCreditById(hotelId, id) {
    const creditRes = await db.query(
      `SELECT c.*, s.name as vendor_name, s.phone as vendor_phone, s.email as vendor_email, s.address as vendor_address, s.gst_number as vendor_gst
       FROM credits c
       LEFT JOIN suppliers s ON c.vendor_id = s.id
       WHERE c.hotel_id = $1 AND c.id = $2`,
      [hotelId, id]
    );

    if (creditRes.rows.length === 0) return null;
    const credit = creditRes.rows[0];
    const amt = Number(credit.amount || 0);
    const paid = Number(credit.paid_amount || 0);
    const formattedCredit = {
      ...credit,
      amount: amt,
      paid_amount: paid,
      remaining_amount: Math.max(0, parseFloat((amt - paid).toFixed(2)))
    };

    const paymentsRes = await db.query(
      'SELECT * FROM credit_payments WHERE credit_id = $1 ORDER BY created_at ASC',
      [id]
    );

    let bill = null;
    let items = [];
    if (credit.bill_id) {
      const billRes = await db.query(
        `SELECT b.*, o.created_at as order_time,
                h.name as hotel_name, h.phone as hotel_phone, h.location as hotel_location, h.gst_percentage
         FROM bills b
         JOIN orders o ON b.order_id = o.id
         LEFT JOIN tables t ON o.table_id = t.id
         LEFT JOIN rooms r ON o.room_id = r.id
         JOIN hotels h ON (t.hotel_id = h.id OR r.hotel_id = h.id)
         WHERE b.id = $1`,
        [credit.bill_id]
      );

      if (billRes.rows.length > 0) {
        bill = billRes.rows[0];
        const itemsRes = await db.query(
          `SELECT oi.quantity, COALESCE(oi.custom_name, mi.name, 'Other') as name, COALESCE(oi.custom_price, mi.price, 0) as price 
           FROM order_items oi 
           LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id 
           WHERE oi.order_id = $1 AND oi.quantity > 0`,
          [bill.order_id]
        );
        items = itemsRes.rows;
      }
    }

    return {
      credit: formattedCredit,
      bill,
      items,
      payments: paymentsRes.rows
    };
  }

  async settleCreditTransaction(hotelId, id, paymentMethod, amountPaid = null, notes = '') {
    const creditRes = await db.query(
      'SELECT * FROM credits WHERE id = $1 AND hotel_id = $2',
      [id, hotelId]
    );
    if (creditRes.rows.length === 0) return null;

    const credit = creditRes.rows[0];
    const creditAmt = Number(credit.amount || 0);
    const currPaid = Number(credit.paid_amount || 0);
    const creditRem = Math.max(0, creditAmt - currPaid);

    const payVal = (amountPaid !== undefined && amountPaid !== null && !isNaN(Number(amountPaid))) 
      ? Math.min(Number(amountPaid), creditRem)
      : creditRem;

    if (payVal <= 0) return { error: 'Credit is already fully settled' };

    const newPaidAmount = currPaid + payVal;
    const isFullyPaid = newPaidAmount >= creditAmt;
    const newStatus = isFullyPaid ? 'settled' : 'partial';

    await db.query(
      `INSERT INTO credit_payments (hotel_id, credit_id, amount_paid, payment_method, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [hotelId, id, payVal, paymentMethod, notes || 'Single credit settlement']
    );

    const updatedRes = await db.query(
      `UPDATE credits 
       SET paid_amount = $1, status = $2, settled_at = $3, settlement_payment_method = $4, updated_at = CURRENT_TIMESTAMP
       WHERE hotel_id = $5 AND id = $6 RETURNING *`,
      [newPaidAmount, newStatus, isFullyPaid ? new Date().toISOString() : credit.settled_at, paymentMethod, hotelId, id]
    );

    if (isFullyPaid && credit.bill_id) {
      await db.query('UPDATE bills SET is_paid = true, payment_method = $1 WHERE id = $2', [paymentMethod, credit.bill_id]);
    }

    return updatedRes.rows[0];
  }
}

module.exports = new CreditRepository();
