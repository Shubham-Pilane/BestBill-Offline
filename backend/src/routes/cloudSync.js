const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const configManager = require('../config/configManager');
const cloudSyncService = require('../services/cloudSyncService');

const REQUIRED_PASSCODE = '779207';

// 1. Verify Passcode
router.post('/verify-passcode', auth, (req, res) => {
  const { passcode } = req.body;
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only owners or admins can access cloud sync settings' });
  }

  if (String(passcode).trim() === REQUIRED_PASSCODE) {
    return res.json({ success: true, message: 'Passcode verified successfully' });
  } else {
    return res.status(401).json({ success: false, message: 'Invalid Passcode. Access Denied.' });
  }
});

// 2. Get Cloud Sync Config
router.get('/config', auth, (req, res) => {
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only owners or admins can view sync settings' });
  }

  const config = configManager.getConfig();
  const defaultUrl = 'https://vejvxpjswlmcsbfiqywp.supabase.co';
  const defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlanZ4cGpzd2xtY3NiZmlxeXdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MzI3NTMsImV4cCI6MjEwMDEwODc1M30.oliBQIW9k8TL_d5q73bza7tt-CSK34yY-prJrYTfcBI';

  res.json({
    cloudSyncEnabled: config.cloudSyncEnabled || false,
    cloudSyncUrl: config.cloudSyncUrl || defaultUrl,
    cloudSyncAnonKey: config.cloudSyncAnonKey || defaultKey,
    cloudSyncHotelCode: config.cloudSyncHotelCode || 'HOTEL_001',
    cloudSyncOwnerEmail: config.cloudSyncOwnerEmail || '',
    cloudSyncOwnerPasswordConfigured: Boolean(config.cloudSyncOwnerPassword),
    cloudSyncIntervalMinutes: config.cloudSyncIntervalMinutes || 15,
    lastCloudSyncTime: config.lastCloudSyncTime || ''
  });
});

// 3. Update Cloud Sync Settings (Requires Passcode)
router.post('/config', auth, async (req, res) => {
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only owners or admins can modify sync settings' });
  }

  const {
    passcode,
    cloudSyncEnabled,
    cloudSyncUrl,
    cloudSyncAnonKey,
    cloudSyncHotelCode,
    cloudSyncOwnerEmail,
    cloudSyncOwnerPassword
  } = req.body;

  // Validate Passcode
  if (String(passcode).trim() !== REQUIRED_PASSCODE) {
    return res.status(401).json({ message: 'Invalid Passcode! Permission denied.' });
  }

  try {
    const currentConfig = configManager.getConfig();

    currentConfig.cloudSyncEnabled = Boolean(cloudSyncEnabled);
    if (cloudSyncUrl !== undefined) currentConfig.cloudSyncUrl = String(cloudSyncUrl).trim();
    if (cloudSyncAnonKey !== undefined) currentConfig.cloudSyncAnonKey = String(cloudSyncAnonKey).trim();
    if (cloudSyncHotelCode !== undefined) currentConfig.cloudSyncHotelCode = String(cloudSyncHotelCode).trim();
    if (cloudSyncOwnerEmail !== undefined) currentConfig.cloudSyncOwnerEmail = String(cloudSyncOwnerEmail).trim();
    
    // Only update password if provided
    if (cloudSyncOwnerPassword && String(cloudSyncOwnerPassword).trim() !== '') {
      currentConfig.cloudSyncOwnerPassword = String(cloudSyncOwnerPassword).trim();
    }

    const saved = configManager.saveConfig(currentConfig);
    if (!saved) {
      return res.status(500).json({ message: 'Failed to save configuration to disk' });
    }

    // If enabled, trigger an immediate test sync
    let syncResult = null;
    if (currentConfig.cloudSyncEnabled) {
      syncResult = await cloudSyncService.performCloudSync();
      if (!syncResult.success) {
        console.error('[SYNC TRIGGER ERROR]', syncResult.error || syncResult.reason);
        return res.status(400).json({ 
          message: syncResult.error || syncResult.reason || 'Cloud Sync failed'
        });
      }
    }

    return res.json({
      message: currentConfig.cloudSyncEnabled 
        ? (syncResult?.warning || 'Cloud Sync settings updated & synced successfully!')
        : 'Cloud Sync disabled successfully',
      cloudSyncEnabled: currentConfig.cloudSyncEnabled,
      warning: syncResult?.warning,
      lastCloudSyncTime: currentConfig.lastCloudSyncTime
    });
  } catch (err) {
    console.error('[CLOUD SYNC CONFIG ROUTE ERROR]', err.message);
    res.status(500).json({ message: 'Error updating cloud sync settings' });
  }
});

// 4. Trigger Instant Manual Sync
router.post('/sync-now', auth, async (req, res) => {
  if (req.user.role !== 'owner' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only owners or admins can trigger sync' });
  }

  try {
    const result = await cloudSyncService.performCloudSync();
    if (result.success) {
      return res.json({ message: 'Cloud sync completed successfully', timestamp: result.timestamp });
    } else {
      return res.status(400).json({ message: result.error || result.reason || 'Sync failed' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Error executing cloud sync' });
  }
});

module.exports = router;
