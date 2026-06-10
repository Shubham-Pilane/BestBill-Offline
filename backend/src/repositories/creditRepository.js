const db = require('../db/db');

class CreditRepository {
  async saveCreditTransaction(hotelId, data, client) {
    const q = client || db;
    const { bill_id, party_type, vendor_id, customer_name, customer_phone, amount } = data;

    // 1. Create credit record
    const res = await q.query(
      `INSERT INTO credits (hotel_id, bill_id, party_type, vendor_id, customer_name, customer_phone, amount, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
      [hotelId, bill_id, party_type, vendor_id, customer_name, customer_phone, amount]
    );

    // 2. Mark corresponding bill as unpaid credit bill
    await q.query(
      `UPDATE bills SET is_paid = false, payment_method = 'credit' WHERE id = $1`,
      [bill_id]
    );

    return res.rows[0];
  }

  async getDashboardSummary(hotelId) {
    const [custRes, vendRes, outstandingRes, settledRes] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(amount), 0) as amt FROM credits 
         WHERE hotel_id = $1 AND party_type = 'customer' AND status = 'pending'`,
        [hotelId]
      ),
      db.query(
        `SELECT COALESCE(SUM(amount), 0) as amt FROM credits 
         WHERE hotel_id = $1 AND party_type = 'vendor' AND status = 'pending'`,
        [hotelId]
      ),
      db.query(
        `SELECT COALESCE(SUM(amount), 0) as amt FROM credits 
         WHERE hotel_id = $1 AND status = 'pending'`,
        [hotelId]
      ),
      db.query(
        `SELECT COALESCE(SUM(amount), 0) as amt FROM credits 
         WHERE hotel_id = $1 AND status = 'settled'`,
        [hotelId]
      )
    ]);

    return {
      customerOutstandingAmount: Number(custRes.rows[0].amt),
      vendorOutstandingAmount: Number(vendRes.rows[0].amt),
      totalOutstandingAmount: Number(outstandingRes.rows[0].amt),
      totalSettledAmount: Number(settledRes.rows[0].amt)
    };
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

    // Filter by Party Type
    if (party_type && party_type !== 'all') {
      queryStr += ` AND c.party_type = $${paramIndex++}`;
      params.push(party_type);
    }

    // Filter by Status
    if (status && status !== 'all') {
      queryStr += ` AND c.status = $${paramIndex++}`;
      params.push(status);
    }

    // Filter by Date
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

    // Search filter
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

    // Order: pending first, then newest first
    queryStr += ' ORDER BY c.status ASC, c.created_at DESC';

    const res = await db.query(queryStr, params);
    return res.rows;
  }

  async getCreditById(hotelId, id) {
    // 1. Fetch the credit transaction
    const creditRes = await db.query(
      `SELECT c.*, s.name as vendor_name, s.phone as vendor_phone, s.email as vendor_email, s.address as vendor_address, s.gst_number as vendor_gst
       FROM credits c
       LEFT JOIN suppliers s ON c.vendor_id = s.id
       WHERE c.hotel_id = $1 AND c.id = $2`,
      [hotelId, id]
    );

    if (creditRes.rows.length === 0) return null;
    const credit = creditRes.rows[0];

    // 2. Fetch the corresponding bill
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

    let bill = null;
    let items = [];
    if (billRes.rows.length > 0) {
      bill = billRes.rows[0];
      // 3. Fetch items of the bill
      const itemsRes = await db.query(
        `SELECT oi.quantity, mi.name, mi.price 
         FROM order_items oi 
         JOIN menu_items mi ON oi.menu_item_id = mi.id 
         WHERE oi.order_id = $1`,
        [bill.order_id]
      );
      items = itemsRes.rows;
    }

    return {
      credit,
      bill,
      items
    };
  }

  async settleCreditTransaction(hotelId, id, paymentMethod, client) {
    const q = client || db;

    // 1. Settle credit record
    const creditRes = await q.query(
      `UPDATE credits 
       SET status = 'settled', settled_at = CURRENT_TIMESTAMP, settlement_payment_method = $1, updated_at = CURRENT_TIMESTAMP
       WHERE hotel_id = $2 AND id = $3 RETURNING *`,
      [paymentMethod, hotelId, id]
    );

    if (creditRes.rows.length === 0) return null;
    const credit = creditRes.rows[0];

    // 2. Mark the corresponding bill as paid with the settlement method
    await q.query(
      `UPDATE bills SET is_paid = true, payment_method = $1 WHERE id = $2`,
      [paymentMethod, credit.bill_id]
    );

    return credit;
  }
}

module.exports = new CreditRepository();
