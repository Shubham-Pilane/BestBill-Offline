const {DatabaseSync} = require('node:sqlite');
const db = new DatabaseSync('./backend/bestbill.db');

function query(text, params = []) {
  // A simplified version of db.js logic
  const sqliteSql = text.replace(/\$\d+/g, '?');
  const safeParams = params.map(p => (p === true ? 1 : p === false ? 0 : p));
  const stmt = db.prepare(sqliteSql);
  if (sqliteSql.trim().toUpperCase().startsWith('SELECT') || sqliteSql.toUpperCase().includes('RETURNING')) {
    return stmt.all(...safeParams);
  } else {
    stmt.run(...safeParams);
    return [];
  }
}

try {
  const tableId = '1';
  let orderRes = query(`SELECT id FROM orders WHERE table_id = $1 AND status = 'active'`, [tableId]);
  let orderId;
  
  if (orderRes.length === 0) {
    const insertOrder = query(
      `INSERT INTO orders (table_id, status, source) VALUES ($1, 'active', 'admin') RETURNING id`,
      [tableId]
    );
    orderId = insertOrder[0].id;
  } else {
    orderId = orderRes[0].id;
  }
  console.log("OrderId:", orderId);

  const menuItemId = 1;
  const quantity = 1;
  const res1 = query(`
    INSERT INTO order_items (order_id, menu_item_id, quantity)
    VALUES ($1, $2, $3)
    ON CONFLICT (order_id, menu_item_id) DO UPDATE SET quantity = order_items.quantity + $3
    RETURNING order_id
  `, [orderId, menuItemId, quantity]);
  console.log("Success:", res1);
} catch (e) {
  console.error("Error:", e.message);
}
