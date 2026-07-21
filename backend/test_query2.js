const path = require('path'); 
const dbPath = path.join(process.env.APPDATA, 'bestbill-desktop', 'bestbill.db'); 
const { DatabaseSync } = require('node:sqlite'); 
const db = new DatabaseSync(dbPath, { open: true }); 
const stmt = db.prepare(`SELECT 
  COALESCE(SUM(CASE WHEN (o.table_id IS NOT NULL AND LOWER(COALESCE(t.table_number, '')) NOT LIKE '%parcel%') THEN b.final_amount ELSE 0 END), 0) as dine_in_sales, 
  COALESCE(SUM(CASE WHEN (o.table_id IS NULL AND o.room_id IS NULL) OR LOWER(COALESCE(t.table_number, '')) LIKE '%parcel%' THEN b.final_amount ELSE 0 END), 0) as parcel_sales 
  FROM bills b JOIN orders o ON b.order_id = o.id LEFT JOIN tables t ON o.table_id = t.id`); 
console.log(stmt.all());
