const path = require('path');
const fs = require('fs');

async function clearTestData() {
  console.log('----------------------------------------------------');
  console.log('         Purging Transactional Test Data...         ');
  console.log('----------------------------------------------------');
  try {
    // 1. Resolve database connection interface
    const dbPath = path.join(__dirname, 'db.js');
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database connection layer not found at: ${dbPath}`);
    }
    const db = require(dbPath);

    // 2. Perform SQLite transaction clearing
    console.log('[1/4] Clearing order items details...');
    await db.query('DELETE FROM order_items');
    
    console.log('[2/4] Clearing bills history...');
    await db.query('DELETE FROM bills');
    
    console.log('[3/4] Clearing orders history and live KOT tables...');
    await db.query('DELETE FROM orders');
    
    console.log('[4/4] Resetting auto-increment sequence logs...');
    // Under SQLite, sequence tracking is stored inside the sqlite_sequence metadata table.
    // Resetting these keeps invoice numbers and order IDs starting from 1 for the client.
    await db.query("DELETE FROM sqlite_sequence WHERE name IN ('bills', 'order_items', 'orders')");
    
    console.log('----------------------------------------------------');
    console.log('SUCCESS: All test billing and order data cleared!');
    console.log('----------------------------------------------------');
    process.exit(0);
  } catch (err) {
    console.error('CRITICAL: Database Purge Sequence Failed!');
    console.error(`Error details: ${err.message}`);
    
    // Log failure log file next to the application executables
    const logPath = path.join(__dirname, '../../../clear_error.log');
    const logContent = `----------------------------------------\n` +
                       `TIMESTAMP : ${new Date().toISOString()}\n` +
                       `FATAL MSG : ${err.message}\n` +
                       `STACKTRACE:\n${err.stack}\n` +
                       `----------------------------------------\n`;
    fs.appendFileSync(logPath, logContent, 'utf8');
    process.exit(1);
  }
}

clearTestData();
