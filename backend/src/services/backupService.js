const fs = require('fs');
const path = require('path');
const db = require('../db/db');
const configManager = require('../config/configManager');

// Resolve backup target directory
const backupsDir = process.env.BESTBILL_BACKUPS_PATH || path.join(__dirname, '../../backups');
const dbPath = process.env.BESTBILL_DB_PATH || path.join(__dirname, '../../bestbill.db');

// Ensure backups directory exists
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

/**
 * Creates a complete offline backup of the database and printer configurations.
 */
async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDbPath = path.join(backupsDir, `bestbill_backup_${timestamp}.db`);
  const backupConfigPath = path.join(backupsDir, `config_backup_${timestamp}.json`);

  console.log(`[BACKUP] Initiating backup sequence...`);

  try {
    // 1. Transactionally consistent SQLite DB backup
    if (db.isNative) {
      console.log('[BACKUP] Using native built-in SQLite backup (Closing connection)...');
      db.sqliteDb.close();
      fs.copyFileSync(dbPath, backupDbPath);
      
      // Re-establish connection
      const { DatabaseSync } = require('node:sqlite');
      db.sqliteDb = new DatabaseSync(dbPath);
      db.sqliteDb.exec('PRAGMA foreign_keys = ON');
    } else {
      console.log('[BACKUP] Using better-sqlite3 native backup...');
      await db.sqliteDb.backup(backupDbPath);
    }
    console.log(`[BACKUP] SQLite DB successfully backed up to: ${backupDbPath}`);

    // 2. Printer settings config.json backup
    if (fs.existsSync(configManager.configPath)) {
      fs.copyFileSync(configManager.configPath, backupConfigPath);
      console.log(`[BACKUP] Configurations successfully backed up to: ${backupConfigPath}`);
    }

    return {
      success: true,
      timestamp,
      dbFile: path.basename(backupDbPath),
      configFile: path.basename(backupConfigPath)
    };
  } catch (err) {
    console.error(`[BACKUP ERROR] Backup sequence aborted:`, err.message);
    throw err;
  }
}

/**
 * List all available backups.
 */
function listBackups() {
  try {
    const files = fs.readdirSync(backupsDir);
    const dbBackups = files
      .filter(f => f.startsWith('bestbill_backup_') && f.endsWith('.db'))
      .map(f => {
        const timestamp = f.replace('bestbill_backup_', '').replace('.db', '');
        const stat = fs.statSync(path.join(backupsDir, f));
        return {
          filename: f,
          timestamp,
          sizeBytes: stat.size,
          createdAt: stat.birthtime
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    return dbBackups;
  } catch (err) {
    console.error('[BACKUP] Failed to list backups:', err.message);
    return [];
  }
}

/**
 * Restore a backup.
 * Warning: Overwrites the current active database and configurations!
 */
async function restoreBackup(timestamp) {
  const targetDbName = `bestbill_backup_${timestamp}.db`;
  const targetConfigName = `config_backup_${timestamp}.json`;

  const targetDbPath = path.join(backupsDir, targetDbName);
  const targetConfigPath = path.join(backupsDir, targetConfigName);

  if (!fs.existsSync(targetDbPath)) {
    throw new Error(`Target backup database file not found: ${targetDbName}`);
  }

  console.log(`[RESTORE] Restoring system state from: ${timestamp}`);

  try {
    // 1. Close current SQLite DB connection safely before replacing the file
    db.sqliteDb.close();
    console.log('[RESTORE] Database connection closed.');

    // 2. Overwrite active database file
    fs.copyFileSync(targetDbPath, dbPath);
    console.log(`[RESTORE] Active SQLite DB overwritten with backup.`);

    // 3. Overwrite active config.json if a backup exists
    if (fs.existsSync(targetConfigPath)) {
      fs.copyFileSync(targetConfigPath, configManager.configPath);
      console.log(`[RESTORE] Active configurations overwritten with backup.`);
    }

    // 4. Force process restart or exit so Electron/Express reboots with fresh DB state
    console.log('[RESTORE] System state restored successfully. Requesting process restart...');
    
    // We exit. Electron main process will automatically capture this or the user can reload.
    setTimeout(() => {
      process.exit(0);
    }, 1000);

    return { success: true, message: 'Restore completed. Restarting system...' };
  } catch (err) {
    console.error(`[RESTORE ERROR] Restore failed:`, err.message);
    throw err;
  }
}

// Start daily automatic backup task at midnight (checks every hour)
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0) {
    console.log('[AUTO-BACKUP] Midnight reached. Triggering automatic daily backup...');
    createBackup().catch(err => console.error('[AUTO-BACKUP ERROR]', err));
  }
}, 1000 * 60 * 60);

module.exports = {
  createBackup,
  listBackups,
  restoreBackup
};
