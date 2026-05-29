const {DatabaseSync} = require('node:sqlite');
const db = new DatabaseSync('./backend/bestbill.db');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='order_items'").all());
