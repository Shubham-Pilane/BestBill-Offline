const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');
const db = require('../db/db');

const SUPABASE_URL = 'https://vejvxpjswlmcsbfiqywp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlanZ4cGpzd2xtY3NiZmlxeXdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MzI3NTMsImV4cCI6MjEwMDEwODc1M30.oliBQIW9k8TL_d5q73bza7tt-CSK34yY-prJrYTfcBI';

let supabase = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.warn('[SUPABASE NOTICE] @supabase/supabase-js package not bundled, utilizing native REST API fallback.');
}

async function supabaseRestCall(endpoint, method = 'GET', body = null, extraHeaders = {}) {
  try {
    const headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...extraHeaders
    };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, options);
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.warn(`[SUPABASE REST ERROR] ${method} ${endpoint}:`, err.message);
    throw err;
  }
}

let cachedHwId = null;

function getDesktopMachineId() {
  if (cachedHwId) return cachedHwId;

  try {
    ensureLicenseFileExists();
    if (fs.existsSync(licenseFilePath)) {
      const content = fs.readFileSync(licenseFilePath, 'utf8');
      const match = content.match(/^HARDWARE_MACHINE_ID=(.+)$/m);
      if (match && match[1] && match[1].trim()) {
        cachedHwId = match[1].trim();
        return cachedHwId;
      }
    }
  } catch (e) {}

  let generatedId = null;

  try {
    // Layer 1: Processor ID
    const rawCpu = execSync('wmic cpu get processorid', { encoding: 'utf8', timeout: 5000 });
    const lines = rawCpu.split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length > 1 && lines[1]) {
      generatedId = `CPU-${lines[1]}`;
    }
  } catch (e) {}

  if (!generatedId) {
    try {
      // Layer 2: Native Windows WMI / CIM ComputerSystemProduct UUID
      const rawUuid = execSync('powershell -ExecutionPolicy Bypass -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"', { encoding: 'utf8', timeout: 5000 });
      const cleaned = (rawUuid || '').trim();
      if (cleaned && cleaned.length > 8 && cleaned !== '00000000-0000-0000-0000-000000000000') {
        generatedId = cleaned;
      }
    } catch (e) {}
  }

  if (!generatedId) {
    generatedId = 'DESKTOP_HW_DEFAULT';
  }

  cachedHwId = generatedId;

  try {
    if (fs.existsSync(licenseFilePath)) {
      fs.appendFileSync(licenseFilePath, `\nHARDWARE_MACHINE_ID=${generatedId}\n`, 'utf8');
    }
  } catch (e) {}

  return cachedHwId;
}

let isRevokedBySuperAdmin = false;

async function checkSupabaseDesktopLicenseStatus() {
  try {
    const hwId = getDesktopMachineId();

    // Trigger auto-sync to ensure hardware record is present in Supabase desktop_licenses
    await syncDesktopUserToSupabase().catch(() => {});

    let data = null;
    if (supabase) {
      const res = await supabase
        .from('desktop_licenses')
        .select('is_active, id')
        .eq('device_uuid', hwId)
        .maybeSingle();
      data = res.data;
    } else {
      const list = await supabaseRestCall(`desktop_licenses?device_uuid=eq.${encodeURIComponent(hwId)}&select=is_active,id`);
      data = (list && list.length > 0) ? list[0] : null;
    }

    if (data && data.is_active === false) {
      isRevokedBySuperAdmin = true;
      return { is_active: false, reason: 'ACCESS TERMINATED: Desktop hardware access revoked by Super Admin.' };
    } else if (data && data.is_active === true) {
      isRevokedBySuperAdmin = false;
    }

    try {
      if (fs.existsSync(licenseFilePath)) {
        let content = fs.readFileSync(licenseFilePath, 'utf8');
        const nowIso = new Date().toISOString();
        if (content.includes('LAST_INTERNET_VERIFICATION_DATE=')) {
          content = content.replace(/LAST_INTERNET_VERIFICATION_DATE=.*(\r?\n|$)/, `LAST_INTERNET_VERIFICATION_DATE=${nowIso}\n`);
        } else {
          content += `LAST_INTERNET_VERIFICATION_DATE=${nowIso}\n`;
        }
        fs.writeFileSync(licenseFilePath, content, 'utf8');
      }
    } catch (err) {}

    return { is_active: !isRevokedBySuperAdmin };
  } catch (e) {
    return { is_active: !isRevokedBySuperAdmin };
  }
}

// Resolve license file next to database file (AppData/Roaming/BestBill/license.txt in production)
const dbDir = path.dirname(db.dbPath);
const licenseFilePath = path.join(dbDir, 'license.txt');

console.log(`[LICENSE] Resolving license file path: ${licenseFilePath}`);

const MONTHLY_KEYS = {
  0: 'X7p9K2m8Q4', // Jan
  1: 'N9wT3zL8r5', // Feb
  2: 'R5bY7qD2k9', // Mar
  3: 'C8uM1xP6t3', // Apr
  4: 'H4kV9nJ3w7', // May
  5: 'Z2rF8yW7m1', // Jun
  6: 'T6pL3cN9q4', // Jul
  7: 'B1dQ7mK5x8', // Aug
  8: 'G9xR2vH4p6', // Sep
  9: 'Y3jC8tM1n7', // Oct
  10: 'P7nW4bX6k2', // Nov
  11: 'L5sZ9qF2r8'  // Dec
};

const YEARLY_KEYS = {
  0: 'M7xK2pQ8r4',
  1: 'T9bW3nL5y7',
  2: 'C4vR8mP1k6',
  3: 'H2qN7xJ9t5',
  4: 'Z8pF3wD6r1',
  5: 'B5mY9kT2c7',
  6: 'L1xV4nQ8p3',
  7: 'R6tK2bW7m9',
  8: 'P3yH8qN5x2',
  9: 'F7cM1rZ4v8'
};

const PERMANENT_KEYS = {
  0: 'V4bN9xK2m7', // Jan
  1: 'Q8pL3rY5j1', // Feb
  2: 'W2cF6tH9d4', // Mar
  3: 'E7mV1kP8n3', // Apr
  4: 'S5xR9qB2z6', // May
  5: 'U3yJ8wF4h9', // Jun
  6: 'A9dG2cN7m5', // Jul
  7: 'D6kP4xL1v8', // Aug
  8: 'K2tR7mB5q3', // Sep
  9: 'J8hN3wV9c1', // Oct
  10: 'F5bY2xM6p4', // Nov
  11: 'M1qL7kH3d9'  // Dec
};

/**
 * Calculates HMAC-SHA256 signature to protect the license file from direct manual edits.
 */
function calculateSignature(key, expiryDate, type) {
  return crypto.createHmac('sha256', 'BestBillLicenseSecretSalt2026')
               .update(`${key}|${expiryDate}|${type}`)
               .digest('hex');
}

/**
 * Ensures that the license.txt file exists inside the database folder.
 * If not, writes a default trial mode template.
 */
function ensureLicenseFileExists() {
  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    if (!fs.existsSync(licenseFilePath)) {
      const template = `# =====================================================================
# BestBill POS Offline - Software License Activation File
# =====================================================================
# This offline desktop installation comes with a 30-day free trial.
# To activate offline access, replace the key below with your
# authorized Monthly, Yearly, or Permanent activation key.
#
# Contact Customer Care to purchase or request your activation key:
#   Phone: +91 9822401802
#   Email: bestbillsolutions@gmail.com
# =====================================================================

ACTIVATION_KEY=TRIAL_MODE
ACTIVATION_DATE=
EXPIRY_DATE=
LICENSE_TYPE=trial
SIGNATURE=
`;
      fs.writeFileSync(licenseFilePath, template, 'utf8');
      console.log(`[LICENSE] Generated new license.txt file at: ${licenseFilePath}`);
    }
  } catch (err) {
    console.error(`[LICENSE ERROR] Failed to ensure license file exists:`, err.message);
  }
}

/**
 * Validates a key string against Monthly, Yearly, and Permanent key tiers.
 * @returns {string|null} The key type ('monthly', 'yearly', 'permanent') or null if invalid.
 */
function validateKeyFormat(key, now = new Date()) {
  if (!key || typeof key !== 'string') return null;
  const trimmedKey = key.trim();

  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const lastDigit = currentYear % 10;

  // Check Permanent / Lifetime
  if (trimmedKey === PERMANENT_KEYS[currentMonth] || Object.values(PERMANENT_KEYS).includes(trimmedKey)) {
    return 'permanent';
  }
  // Check Monthly
  if (trimmedKey === MONTHLY_KEYS[currentMonth] || Object.values(MONTHLY_KEYS).includes(trimmedKey)) {
    return 'monthly';
  }
  // Check Yearly
  if (trimmedKey === YEARLY_KEYS[lastDigit] || Object.values(YEARLY_KEYS).includes(trimmedKey)) {
    return 'yearly';
  }

  return null;
}

/**
 * Reads, parses and validates the local license file parameters.
 * Automatically promotes a queued license if the current license is expired.
 * @returns {object} Parsed and validated license details.
 */
function getLicenseDetails() {
  try {
    if (isRevokedBySuperAdmin) {
      return {
        type: 'revoked',
        key: 'REVOKED',
        activatedAt: '',
        expiresAt: '',
        daysRemaining: 0,
        isValid: false,
        reason: 'ACCESS TERMINATED: Desktop hardware access revoked by Super Admin.'
      };
    }
    ensureLicenseFileExists();
    if (!fs.existsSync(licenseFilePath)) {
      return { type: 'trial', isValid: false, daysRemaining: 0, hasQueuedLicense: false };
    }

    const content = fs.readFileSync(licenseFilePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const parsed = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed === '') {
        continue;
      }
      if (trimmed.includes('=')) {
        const parts = trimmed.split('=');
        parsed[parts[0].trim()] = parts[1].trim();
      }
    }

    let key = parsed.ACTIVATION_KEY || 'TRIAL_MODE';
    let activatedAt = parsed.ACTIVATION_DATE || '';
    let expiresAt = parsed.EXPIRY_DATE || '';
    let type = parsed.LICENSE_TYPE || 'trial';
    let signature = parsed.SIGNATURE || '';
    let lastInternetDate = parsed.LAST_INTERNET_VERIFICATION_DATE || '';

    const queuedKey = parsed.QUEUED_KEY || '';
    const queuedType = parsed.QUEUED_TYPE || '';

    const now = new Date();
    let isValid = false;
    let daysRemaining = 0;

    if (key !== 'TRIAL_MODE' && type !== 'trial') {
      const expectedSig = calculateSignature(key, expiresAt, type);
      if (signature === expectedSig) {
        const expiresDate = new Date(expiresAt);
        const timeDiff = expiresDate.getTime() - now.getTime();
        daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
        isValid = now <= expiresDate;
      } else {
        console.error('[LICENSE WARNING] Signature mismatch! License parameters tampered.');
      }
    }

    // --- AUTOMATIC PROMOTION OF QUEUED LICENSE ON EXPIRY ---
    if (!isValid && queuedKey) {
      const detectedQueuedType = queuedType || validateKeyFormat(queuedKey) || 'monthly';
      console.log(`[LICENSE] Current license expired. Automatically activating queued ${detectedQueuedType.toUpperCase()} license key...`);

      let newExpiry = '';
      if (detectedQueuedType === 'permanent') {
        newExpiry = new Date('2099-12-31T23:59:59.999Z').toISOString();
      } else if (detectedQueuedType === 'yearly') {
        newExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
      } else {
        newExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      const newActivatedAt = now.toISOString();
      const newSignature = calculateSignature(queuedKey, newExpiry, detectedQueuedType);

      const promotedContent = `# =====================================================================
# BestBill POS Offline - Software License Activation File
# =====================================================================
ACTIVATION_KEY=${queuedKey}
ACTIVATION_DATE=${newActivatedAt}
EXPIRY_DATE=${newExpiry}
LICENSE_TYPE=${detectedQueuedType}
SIGNATURE=${newSignature}
QUEUED_KEY=
QUEUED_TYPE=
QUEUED_SIGNATURE=
`;
      fs.writeFileSync(licenseFilePath, promotedContent, 'utf8');
      console.log(`[LICENSE] Queued license promoted and activated! Type: ${detectedQueuedType}, Expiry: ${newExpiry}`);

      const expiresDate = new Date(newExpiry);
      const timeDiff = expiresDate.getTime() - now.getTime();
      return {
        type: detectedQueuedType,
        key: queuedKey,
        activatedAt: newActivatedAt,
        expiresAt: newExpiry,
        daysRemaining: Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24))),
        isValid: true,
        hasQueuedLicense: false,
        queuedType: null
      };
    }

    let warning = false;
    let offlineDays = 0;

    let verificationAnchorDate = lastInternetDate || activatedAt;
    if (!verificationAnchorDate && isValid) {
      verificationAnchorDate = now.toISOString();
      try {
        if (fs.existsSync(licenseFilePath)) {
          let content = fs.readFileSync(licenseFilePath, 'utf8');
          if (content.includes('LAST_INTERNET_VERIFICATION_DATE=')) {
            content = content.replace(/LAST_INTERNET_VERIFICATION_DATE=.*(\r?\n|$)/, `LAST_INTERNET_VERIFICATION_DATE=${verificationAnchorDate}\n`);
          } else {
            content += `LAST_INTERNET_VERIFICATION_DATE=${verificationAnchorDate}\n`;
          }
          fs.writeFileSync(licenseFilePath, content, 'utf8');
        }
      } catch (e) {}
    }

    if (verificationAnchorDate) {
      const lastPing = new Date(verificationAnchorDate);
      if (!isNaN(lastPing.getTime())) {
        const timeDiff = now.getTime() - lastPing.getTime();
        
        // Calculate normal offline days
        const msPerDay = 1000 * 60 * 60 * 24;
        offlineDays = Math.floor(timeDiff / msPerDay);
        
        if (offlineDays >= 30) {
          return {
            type: 'suspended',
            key,
            activatedAt,
            expiresAt,
            daysRemaining: 0,
            isValid: false,
            reason: 'OFFLINE_SUSPENDED: Your application has not been connected to the internet for the last 30 days. Please connect to the internet to verify your license.',
            offlineDays,
            hasQueuedLicense: false
          };
        } else if (offlineDays >= 25) {
          warning = true;
        }
      }
    }

    return {
      type,
      key,
      activatedAt,
      expiresAt,
      daysRemaining,
      isValid,
      hasQueuedLicense: Boolean(queuedKey),
      queuedType: queuedType || null,
      warning,
      offlineDays
    };
  } catch (err) {
    console.error(`[LICENSE ERROR] Failed to get license details:`, err.message);
    return { type: 'trial', isValid: false, daysRemaining: 0, hasQueuedLicense: false };
  }
}

/**
 * Returns the current activation key string.
 */
function getLicenseKey() {
  const details = getLicenseDetails();
  return details.key || 'TRIAL_MODE';
}

/**
 * Checks if the configured license is valid and not expired.
 * @returns {boolean} True if license is valid, false otherwise.
 */
function isLicenseValid() {
  const details = getLicenseDetails();
  return details.isValid;
}

/**
 * Validates, calculates expiry dates and writes the given activation key parameters to the license file.
 * Supports Monthly (30 days), Yearly (365 days), and Permanent (lifetime) tiers.
 */
function setLicenseKey(key) {
  try {
    ensureLicenseFileExists();
    
    let type = 'trial';
    let expiry = '';
    const now = new Date();
    const currentMonth = now.getMonth();

    if (key === 'TRIAL_MODE') {
      type = 'trial';
    } else if (key === PERMANENT_KEYS[currentMonth] || Object.values(PERMANENT_KEYS).includes(key)) {
      type = 'permanent';
      expiry = new Date('2099-12-31T23:59:59.999Z').toISOString();
    } else if (key === MONTHLY_KEYS[currentMonth] || Object.values(MONTHLY_KEYS).includes(key)) {
      type = 'monthly';
      expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      const currentYear = now.getFullYear();
      const lastDigit = currentYear % 10;
      if (key === YEARLY_KEYS[lastDigit] || Object.values(YEARLY_KEYS).includes(key)) {
        type = 'yearly';
        expiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
      } else {
        console.warn(`[LICENSE] Key rejected. Invalid format.`);
        return false;
      }
    }

    const activatedAt = type === 'trial' ? '' : now.toISOString();
    const signature = type === 'trial' ? '' : calculateSignature(key, expiry, type);

    const newContent = `# =====================================================================
# BestBill POS Offline - Software License Activation File
# =====================================================================
ACTIVATION_KEY=${key}
ACTIVATION_DATE=${activatedAt}
EXPIRY_DATE=${expiry}
LICENSE_TYPE=${type}
SIGNATURE=${signature}
QUEUED_KEY=
QUEUED_TYPE=
QUEUED_SIGNATURE=
`;
    
    fs.writeFileSync(licenseFilePath, newContent, 'utf8');
    console.log(`[LICENSE] Key successfully set and serialized. Type: ${type}, Expiry: ${expiry}`);
    
    // Auto-sync updated license plan to Supabase desktop_licenses immediately
    try {
      syncDesktopUserToSupabase().catch(() => {});
    } catch (sErr) {}

    return true;
  } catch (err) {
    console.error(`[LICENSE ERROR] Failed to set license key:`, err.message);
    return false;
  }
}

/**
 * Update / Queue License Key feature:
 * If current license is active, queues the new key for auto-activation upon current plan expiry.
 * If current license is expired or trial, activates immediately.
 */
function updateOrQueueLicenseKey(key) {
  try {
    ensureLicenseFileExists();
    if (!key || typeof key !== 'string') {
      return { success: false, message: 'License key is required.' };
    }

    const trimmedKey = key.trim();
    const keyType = validateKeyFormat(trimmedKey);
    if (!keyType) {
      return { success: false, message: 'Invalid license key. Please enter a valid Monthly, Yearly, or Lifetime key.' };
    }

    const details = getLicenseDetails();

    // If current license is ACTIVE (not expired), queue the key
    if (details.isValid && details.type !== 'trial') {
      const queuedSig = calculateSignature(trimmedKey, 'QUEUED', keyType);
      
      const content = fs.readFileSync(licenseFilePath, 'utf8');
      const lines = content.split(/\r?\n/);
      const parsed = {};
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const parts = trimmed.split('=');
          parsed[parts[0].trim()] = parts[1].trim();
        }
      }

      const newContent = `# =====================================================================
# BestBill POS Offline - Software License Activation File
# =====================================================================
ACTIVATION_KEY=${parsed.ACTIVATION_KEY || ''}
ACTIVATION_DATE=${parsed.ACTIVATION_DATE || ''}
EXPIRY_DATE=${parsed.EXPIRY_DATE || ''}
LICENSE_TYPE=${parsed.LICENSE_TYPE || ''}
SIGNATURE=${parsed.SIGNATURE || ''}
QUEUED_KEY=${trimmedKey}
QUEUED_TYPE=${keyType}
QUEUED_SIGNATURE=${queuedSig}
`;
      fs.writeFileSync(licenseFilePath, newContent, 'utf8');
      console.log(`[LICENSE QUEUED] License key for ${keyType.toUpperCase()} plan queued successfully!`);
      return {
        success: true,
        isQueued: true,
        queuedType: keyType,
        message: `New ${keyType.toUpperCase()} license key queued successfully! It will activate automatically when your current plan ends.`
      };
    } else {
      // If expired or trial, activate immediately
      const success = setLicenseKey(trimmedKey);
      if (success) {
        return {
          success: true,
          isQueued: false,
          queuedType: keyType,
          message: `License key for ${keyType.toUpperCase()} plan activated successfully!`
        };
      } else {
        return { success: false, message: 'Failed to activate license key.' };
      }
    }
  } catch (err) {
    console.error(`[LICENSE ERROR] Failed to update or queue license key:`, err.message);
    return { success: false, message: 'Server error updating license key.' };
  }
}

async function syncDesktopUserToSupabase({ owner_name, mobile_number, hotel_name, address, email } = {}) {
  try {
    const hwId = getDesktopMachineId();
    const nowIso = new Date().toISOString();

    // Fetch active license plan details (e.g. 'yearly', 'monthly', 'permanent', 'trial')
    const activeLicense = getLicenseDetails();
    const activePlanType = activeLicense.type || 'trial';

    // Fetch latest details from local database
    let finalOwner = owner_name;
    let finalMobile = mobile_number;
    let finalHotel = hotel_name;
    let finalAddress = address;
    let finalEmail = email;

    try {
      const userRes = await db.query("SELECT name, email FROM users WHERE role = 'owner' ORDER BY id ASC LIMIT 1");
      if (userRes.rows.length > 0) {
        finalOwner = finalOwner || userRes.rows[0].name;
        finalEmail = finalEmail || userRes.rows[0].email;
      }
      const hotelRes = await db.query("SELECT name, phone, location, email FROM hotels LIMIT 1");
      if (hotelRes.rows.length > 0) {
        finalHotel = finalHotel || hotelRes.rows[0].name;
        finalMobile = finalMobile || hotelRes.rows[0].phone;
        finalAddress = finalAddress || hotelRes.rows[0].location;
        if (hotelRes.rows[0].email) {
          finalEmail = hotelRes.rows[0].email;
        }
      }
    } catch (dbErr) {
      console.warn('[SUPABASE DESKTOP SYNC] Local DB query error:', dbErr.message);
    }

    // Check if record already exists for this desktop hardware UUID
    let existing = null;
    if (supabase) {
      const { data } = await supabase
        .from('desktop_licenses')
        .select('id, is_active')
        .eq('device_uuid', hwId)
        .maybeSingle();
      existing = data;
    } else {
      const list = await supabaseRestCall(`desktop_licenses?device_uuid=eq.${encodeURIComponent(hwId)}&select=id,is_active`);
      existing = (list && list.length > 0) ? list[0] : null;
    }

    const payload = {
      owner_name: finalOwner || 'Shubham Pilane',
      mobile_number: finalMobile || '',
      hotel_name: finalHotel || 'Desktop Hotel',
      address: finalAddress || '',
      email: finalEmail || '',
      device_uuid: hwId,
      plan: activePlanType,
      last_ping_at: nowIso,
      updated_at: nowIso
    };

    if (!existing) {
      if (supabase) {
        await supabase.from('desktop_licenses').insert({ ...payload, is_active: true, registration_date: nowIso });
      } else {
        await supabaseRestCall('desktop_licenses', 'POST', { ...payload, is_active: true, registration_date: nowIso });
      }
      console.log(`[SUPABASE DESKTOP SYNC] Inserted desktop record (${hwId}) with plan: ${activePlanType}`);
    } else {
      if (supabase) {
        await supabase.from('desktop_licenses').update(payload).eq('id', existing.id);
      } else {
        await supabaseRestCall(`desktop_licenses?id=eq.${existing.id}`, 'PATCH', payload);
      }
      console.log(`[SUPABASE DESKTOP SYNC] Updated desktop record (${hwId}) with plan: ${activePlanType}`);
    }
  } catch (e) {
    console.warn('[SUPABASE DESKTOP SYNC] Error:', e.message);
  }
}

module.exports = {
  ensureLicenseFileExists,
  getLicenseKey,
  isLicenseValid,
  getLicenseDetails,
  setLicenseKey,
  updateOrQueueLicenseKey,
  validateKeyFormat,
  getDesktopMachineId,
  syncDesktopUserToSupabase,
  checkSupabaseDesktopLicenseStatus,
  licenseFilePath
};
