const path = require('path');
const fs = require('fs');
const db = require('../db/db');

const SECRET_KEY = 'X7P9K2M8Q4';

// Resolve license file next to database file (AppData/Roaming/BestBill/license.txt in production)
const dbDir = path.dirname(db.dbPath);
const licenseFilePath = path.join(dbDir, 'license.txt');

console.log(`[LICENSE] Resolving license file path: ${licenseFilePath}`);

/**
 * Ensures that the license.txt file exists inside the database folder.
 * If not, writes a default template with clear activation instructions.
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
# To activate lifetime offline access, replace the key below with
# your authorized premium license key.
#
# Contact Customer Care to purchase or request your activation key:
#   Phone: +91 9822401802
#   Email: bestbillcustomercare@gmail.com
# =====================================================================

ACTIVATION_KEY=TRIAL_MODE
`;
      fs.writeFileSync(licenseFilePath, template, 'utf8');
      console.log(`[LICENSE] Generated new license.txt file at: ${licenseFilePath}`);
    }
  } catch (err) {
    console.error(`[LICENSE ERROR] Failed to ensure license file exists:`, err.message);
  }
}

/**
 * Reads and parses the local license file to extract the activation key.
 * @returns {string} The parsed activation key or 'TRIAL_MODE' if parsing fails.
 */
function getLicenseKey() {
  try {
    ensureLicenseFileExists();
    if (!fs.existsSync(licenseFilePath)) {
      return 'TRIAL_MODE';
    }

    const content = fs.readFileSync(licenseFilePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmedLine = line.trim();
      // Skip comments or empty lines
      if (trimmedLine.startsWith('#') || trimmedLine === '') {
        continue;
      }
      if (trimmedLine.includes('=')) {
        const parts = trimmedLine.split('=');
        if (parts[0].trim() === 'ACTIVATION_KEY') {
          return parts[1].trim();
        }
      }
    }
  } catch (err) {
    console.error(`[LICENSE ERROR] Failed to read license key:`, err.message);
  }
  return 'TRIAL_MODE';
}

/**
 * Checks if the configured license is valid for lifetime access.
 * @returns {boolean} True if license is valid, false otherwise.
 */
function isLicenseValid() {
  const key = getLicenseKey();
  return key === SECRET_KEY;
}

module.exports = {
  ensureLicenseFileExists,
  getLicenseKey,
  isLicenseValid,
  licenseFilePath
};
