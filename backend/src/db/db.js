const path = require('path');
const fs = require('fs');

// Resolve SQLite database path
const dbPath = process.env.BESTBILL_DB_PATH || path.join(__dirname, '../../bestbill.db');
console.log(`[SQLITE] Resolving database path: ${dbPath}`);

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let sqliteDb;
let isNative = false;

// Dual-Driver Initialization (Native node:sqlite ➡️ better-sqlite3)
try {
  const { DatabaseSync } = require('node:sqlite');
  sqliteDb = new DatabaseSync(dbPath);
  isNative = true;
  sqliteDb.exec('PRAGMA foreign_keys = ON');
  console.log(`[SQLITE] Connected using native built-in node:sqlite driver. 100% zero-dependency POS!`);
} catch (nativeErr) {
  try {
    const Database = require('better-sqlite3');
    sqliteDb = new Database(dbPath, { verbose: console.log });
    sqliteDb.pragma('foreign_keys = ON');
    console.log(`[SQLITE] Connected using better-sqlite3 native driver.`);
  } catch (betterErr) {
    console.error(`[SQLITE INIT FATAL] Failed to load any SQLite driver on this machine!`);
    console.error(`  - Native node:sqlite failed:`, nativeErr.message);
    console.error(`  - better-sqlite3 fallback failed:`, betterErr.message);
    console.error(`Please install Visual Studio Build Tools, or use Node.js version >= 22.5.0.`);
    throw new Error(`Database initialization failed: No SQLite driver loaded.\n\n` +
                    `Details:\n` +
                    `- Built-in node:sqlite error: ${nativeErr.message}\n` +
                    `- better-sqlite3 error: ${betterErr.message}`);
  }
}

/**
 * Pre-processes Postgres queries to make them compatible with SQLite.
 */
function preprocessSql(sql, params) {
  let cleanedSql = sql;
  let adjustedParams = params ? [...params] : [];

  // 1. Convert PG parameterized placeholders ($1, $2, etc.) to SQLite placeholders (?)
  cleanedSql = cleanedSql.replace(/\$(\d+)/g, '?');

  // 2. Map data type differences (primarily for schema initialization)
  cleanedSql = cleanedSql
    .replace(/ADD COLUMN IF NOT EXISTS/gi, 'ADD COLUMN')
    .replace(/SERIAL PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
    .replace(/character varying\(\d+\)/gi, 'TEXT')
    .replace(/character varying/gi, 'TEXT')
    .replace(/timestamp without time zone/gi, 'TIMESTAMP')
    .replace(/timestamp/gi, 'TIMESTAMP')
    .replace(/numeric\(\d+,\s*\d+\)/gi, 'NUMERIC')
    .replace(/numeric/gi, 'NUMERIC')
    .replace(/decimal\(\d+,\s*\d+\)/gi, 'NUMERIC')
    .replace(/decimal/gi, 'NUMERIC');

  // 3. Translate specific temporal PG intervals and datetime functions
  cleanedSql = cleanedSql
    .replace(/NOW\(\) - INTERVAL '2 days'/gi, "datetime('now', '-2 days')")
    .replace(/NOW\(\) - INTERVAL '1 year'/gi, "datetime('now', '-1 year')")
    .replace(/NOW\(\)/gi, "datetime('now', 'localtime')")
    .replace(/CURRENT_TIMESTAMP/gi, "(datetime('now', 'localtime'))")
    .replace(/CURRENT_DATE/gi, "date('now', 'localtime')");

  // Handle unique PG onboarding intervals like: NOW() + $7::interval
  if (cleanedSql.includes('?::interval') || cleanedSql.includes('?::timestamp')) {
    cleanedSql = cleanedSql
      .replace(/\+\s*\?::interval/gi, "+ ?")
      .replace(/::timestamp/gi, "");
    
    // Clean string parameters like "1 months" to just "+1 month" for SQLite datetime math compatibility
    adjustedParams = adjustedParams.map(p => {
      if (typeof p === 'string' && p.endsWith(' months')) {
        const val = parseInt(p.split(' ')[0]) || 1;
        return `+${val} month`;
      }
      return p;
    });
  }

  return { sql: cleanedSql, params: adjustedParams };
}

/**
 * Execute a query on the SQLite database
 */
const query = (text, params = []) => {
  return new Promise((resolve, reject) => {
    try {
      const { sql: sqliteSql, params: sqliteParams } = preprocessSql(text, params);
      
      // node:sqlite driver cannot bind JavaScript true/false — convert to 1/0
      const safeParams = sqliteParams.map(p => {
        if (p === true) return 1;
        if (p === false) return 0;
        return p;
      });

      const stmt = sqliteDb.prepare(sqliteSql);
      const isSelect = sqliteSql.trim().toUpperCase().startsWith('SELECT') || sqliteSql.toUpperCase().includes('RETURNING');

      if (isSelect) {
        // Query returns rows
        const rows = stmt.all(...safeParams);
        resolve({
          rows,
          rowCount: rows.length
        });
      } else {
        // Query mutates state (INSERT, UPDATE, DELETE)
        const info = stmt.run(...safeParams);
        resolve({
          rows: [],
          rowCount: info.changes
        });
      }
    } catch (err) {
      console.error(`[SQLITE ERROR] Query failed: ${text}`);
      console.error(err);
      reject(err);
    }
  });
};

/**
 * Mock PG transaction client
 */
const getClient = async () => {
  return {
    query: (text, params) => query(text, params),
    release: () => {}
  };
};

module.exports = {
  query,
  getClient,
  sqliteDb,
  dbPath,
  isNative
};
