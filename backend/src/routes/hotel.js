const express = require('express');
const db = require('../db/db');
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const router = express.Router();

// Get hotel profile
router.get('/', auth, async (req, res) => {
  try {
    const hotel = await db.query('SELECT * FROM hotels WHERE id = $1', [req.user.hotel_id]);
    res.json(hotel.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error fetching hotel' });
  }
});

// Update hotel details (Owner only)
router.put('/', auth, async (req, res) => {
  const { name, address, upi_id, gst_percentage, printer_size, billing_method, fssai_number, email, phone } = req.body;
  if (req.user.role !== 'owner') return res.status(403).json({ message: 'Only owners can modify hotel settings' });
  try {
    const updated = await db.query(
      'UPDATE hotels SET name = $1, location = $2, upi_id = $3, gst_percentage = $4, printer_size = $5, billing_method = $6, fssai_number = $7, email = $8, phone = $9 WHERE id = $10 RETURNING *',
      [name, address, upi_id, gst_percentage || 0, printer_size || '80mm', billing_method || 'qz', fssai_number, email, phone, req.user.hotel_id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error updating hotel' });
  }
});

// STAFF MANAGEMENT (WAITERS)

// Get all waiters for a hotel
router.get('/waiters', auth, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ message: 'Unauthorized' });
  try {
    const waiters = await db.query(
      'SELECT id, name, email, created_at FROM users WHERE hotel_id = $1 AND role = $2',
      [req.user.hotel_id, 'waiter']
    );
    res.json(waiters.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching staff' });
  }
});

// Add a waiter
router.post('/waiters', auth, async (req, res) => {
  const { name, email, password } = req.body;
  if (req.user.role !== 'owner') return res.status(403).json({ message: 'Unauthorized' });

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ message: 'Staff email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const waiter = await db.query(
      'INSERT INTO users (name, email, password, role, hotel_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email',
      [name, email, hashed, 'waiter', req.user.hotel_id]
    );

    res.status(201).json(waiter.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error hiring staff' });
  }
});

// Remove a waiter
router.delete('/waiters/:id', auth, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ message: 'Unauthorized' });
  try {
    await db.query('DELETE FROM users WHERE id = $1 AND hotel_id = $2 AND role = $3', [req.params.id, req.user.hotel_id, 'waiter']);
    res.json({ message: 'Staff member removed' });
  } catch (err) {
    res.status(500).json({ message: 'Fire failed' });
  }
});

// --- OFFLINE POS PRINTER & BACKUP CONFIGS ---
const configManager = require('../config/configManager');
const backupService = require('../services/backupService');

const { exec } = require('child_process');

// Get active offline printers & guest IP configuration
router.get('/printers-config', auth, (req, res) => {
  try {
    const config = configManager.getConfig();
    res.json({
      printers: config.printers,
      guestIp: config.guestIp || ''
    });
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving configurations' });
  }
});

// Update offline printers & guest IP configuration
router.post('/printers-config', auth, (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ message: 'Unauthorized' });
  try {
    const { billing, kitchen, guestIp } = req.body;
    const config = configManager.getConfig();
    
    if (billing) config.printers.billing = billing;
    if (kitchen) config.printers.kitchen = kitchen;
    if (guestIp !== undefined) config.guestIp = guestIp;

    configManager.saveConfig(config);
    res.json({ 
      success: true, 
      message: 'Configuration saved successfully', 
      printers: config.printers,
      guestIp: config.guestIp 
    });
  } catch (err) {
    res.status(500).json({ message: 'Error updating configurations' });
  }
});

// Get list of connected printers on the Windows host machine
router.get('/installed-printers', auth, (req, res) => {
  if (process.platform === 'win32') {
    exec('powershell -Command "Get-Printer | Select-Object Name | ConvertTo-Json"', (err, stdout, stderr) => {
      if (err) {
        console.error('Failed to get printers:', err);
        return res.status(500).json({ message: 'Failed to retrieve system printers' });
      }
      try {
        const data = JSON.parse(stdout.trim());
        const printersList = Array.isArray(data) ? data : (data ? [data] : []);
        const names = printersList.map(p => p.Name).filter(Boolean);
        res.json(names);
      } catch (parseErr) {
        const names = stdout.split('\n')
          .map(line => line.trim())
          .filter(line => line && line !== 'Name' && !line.startsWith('----'));
        res.json(names);
      }
    });
  } else {
    res.json(['Mock Thermal Printer 1', 'Mock KOT Printer 2']);
  }
});

// Manual backup trigger
router.post('/backup', auth, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ message: 'Unauthorized' });
  try {
    const backupInfo = await backupService.createBackup();
    res.json({ success: true, message: 'Backup created successfully', backup: backupInfo });
  } catch (err) {
    res.status(500).json({ message: 'System backup execution failed', detail: err.message });
  }
});

// Get list of recent backups
router.get('/backups', auth, (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ message: 'Unauthorized' });
  try {
    const backups = backupService.listBackups();
    res.json(backups);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve backups list' });
  }
});

// Restore from a specific backup
router.post('/backup/restore', auth, async (req, res) => {
  if (req.user.role !== 'owner') return res.status(403).json({ message: 'Unauthorized' });
  const { timestamp } = req.body;
  if (!timestamp) return res.status(400).json({ message: 'Timestamp is required for restore' });
  
  try {
    const restoreResult = await backupService.restoreBackup(timestamp);
    res.json(restoreResult);
  } catch (err) {
    res.status(500).json({ message: 'Failed to restore system state', detail: err.message });
  }
});

// Get Lodging Module Activation Status
router.get('/lodging-status', auth, (req, res) => {
  try {
    const config = configManager.getConfig();
    res.json({ lodgingEnabled: !!config.lodgingEnabled });
  } catch (err) {
    res.status(500).json({ message: 'Error checking lodging status' });
  }
});

// Toggle Lodging Module (Passcode Restricted)
router.post('/toggle-lodging', auth, (req, res) => {
  const { enabled, passcode } = req.body;
  if (req.user.role !== 'owner') return res.status(403).json({ message: 'Unauthorized' });

  try {
    const config = configManager.getConfig();

    if (enabled) {
      if (passcode !== '231018') {
        return res.status(400).json({ message: 'Incorrect activation password' });
      }
      config.lodgingEnabled = true;
    } else {
      config.lodgingEnabled = false;
    }

    configManager.saveConfig(config);
    res.json({ success: true, lodgingEnabled: config.lodgingEnabled });
  } catch (err) {
    res.status(500).json({ message: 'Error updating lodging configuration' });
  }
});

module.exports = router;
