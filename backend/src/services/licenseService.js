const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db/db');

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
  0: 'X7P9K2M8Q4', // Jan
  1: 'N9WT3ZL8R5', // Feb
  2: 'R5BY7QD2K9', // Mar
  3: 'C8UM1XP6T3', // Apr
  4: 'H4KV9NJ3W7', // May
  5: 'Z2RF8YW7M1', // Jun
  6: 'T6PL3CN9Q4', // Jul
  7: 'B1DQ7MK5X8', // Aug
  8: 'G9XR2VH4P6', // Sep
  9: 'Y3JC8TM1N7', // Oct
  10: 'P7NW4BX6K2', // Nov
  11: 'L5SZ9QF2R8'  // Dec
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
#   Email: bestbillcustomercare@gmail.com
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
 * Reads, parses and validates the local license file parameters.
 * @returns {object} Parsed and validated license details.
 */
function getLicenseDetails() {
  try {
    ensureLicenseFileExists();
    if (!fs.existsSync(licenseFilePath)) {
      return { type: 'trial', isValid: false, daysRemaining: 0 };
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

    const key = parsed.ACTIVATION_KEY || 'TRIAL_MODE';
    const activatedAt = parsed.ACTIVATION_DATE || '';
    const expiresAt = parsed.EXPIRY_DATE || '';
    const type = parsed.LICENSE_TYPE || 'trial';
    const signature = parsed.SIGNATURE || '';

    if (key === 'TRIAL_MODE' || type === 'trial') {
      return {
        type: 'trial',
        key,
        isValid: false,
        daysRemaining: 0
      };
    }

    // Verify signature to block direct manual files modifications
    const expectedSig = calculateSignature(key, expiresAt, type);
    if (signature !== expectedSig) {
      console.error('[LICENSE WARNING] Signature mismatch! License parameters tampered.');
      return {
        type: 'invalid',
        key,
        isValid: false,
        daysRemaining: 0
      };
    }

    const now = new Date();
    const expiresDate = new Date(expiresAt);
    const timeDiff = expiresDate.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
    const isValid = now <= expiresDate;

    return {
      type,
      key,
      activatedAt,
      expiresAt,
      daysRemaining,
      isValid
    };
  } catch (err) {
    console.error(`[LICENSE ERROR] Failed to get license details:`, err.message);
    return { type: 'trial', isValid: false, daysRemaining: 0 };
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
    } else if (key === PERMANENT_KEYS[currentMonth]) {
      type = 'permanent';
      expiry = new Date('2099-12-31T23:59:59.999Z').toISOString();
    } else if (Object.values(PERMANENT_KEYS).includes(key)) {
      // Reject permanent keys that belong to other months
      console.warn(`[LICENSE] Permanent key rejected. Not valid for current month.`);
      return false;
    } else {
      // Check Monthly
      if (key === MONTHLY_KEYS[currentMonth]) {
        type = 'monthly';
        expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
      } else {
        // Check Yearly
        const currentYear = now.getFullYear();
        const lastDigit = currentYear % 10;
        if (key === YEARLY_KEYS[lastDigit]) {
          type = 'yearly';
          expiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 365 days
        } else {
          console.warn(`[LICENSE] Key rejected. Not valid for current month/year/permanent.`);
          return false;
        }
      }
    }

    const activatedAt = type === 'trial' ? '' : now.toISOString();
    const signature = type === 'trial' ? '' : calculateSignature(key, expiry, type);

    const newContent = `# =====================================================================
# BestBill POS Offline - Software License Activation File
# =====================================================================
# This offline desktop installation comes with a 30-day free trial.
# To activate offline access, replace the key below with your
# authorized Monthly, Yearly, or Permanent activation key.
#
# Contact Customer Care to purchase or request your activation key:
#   Phone: +91 9822401802
#   Email: bestbillcustomercare@gmail.com
# =====================================================================

ACTIVATION_KEY=${key}
ACTIVATION_DATE=${activatedAt}
EXPIRY_DATE=${expiry}
LICENSE_TYPE=${type}
SIGNATURE=${signature}
`;
    
    fs.writeFileSync(licenseFilePath, newContent, 'utf8');
    console.log(`[LICENSE] Key successfully set and serialized. Type: ${type}, Expiry: ${expiry}`);
    return true;
  } catch (err) {
    console.error(`[LICENSE ERROR] Failed to set license key:`, err.message);
    return false;
  }
}

module.exports = {
  ensureLicenseFileExists,
  getLicenseKey,
  isLicenseValid,
  getLicenseDetails,
  setLicenseKey,
  licenseFilePath
};
