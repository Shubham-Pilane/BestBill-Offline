const fs = require('fs');
const path = require('path');

// Resolve path to AppData/Roaming/BestBill/config.json
const configPath = process.env.BESTBILL_DB_PATH 
  ? path.join(path.dirname(process.env.BESTBILL_DB_PATH), 'config.json')
  : path.join(__dirname, '../../config.json');

const defaultConfig = {
  hotelId: 1,
  printers: {
    billing: {
      type: "usb",
      printerName: "billing-printer",
      paperSize: "80mm"
    },
    kitchen: {
      type: "usb",
      printerName: "kitchen-printer",
      paperSize: "80mm"
    }
  }
};

/**
 * Read configurations from local config.json
 */
function getConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      saveConfig(defaultConfig);
      return defaultConfig;
    }
    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[CONFIG MANAGER] Error reading config:', err.message);
    return defaultConfig;
  }
}

/**
 * Write configurations to local config.json
 */
function saveConfig(config) {
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`[CONFIG MANAGER] Configuration saved to: ${configPath}`);
    return true;
  } catch (err) {
    console.error('[CONFIG MANAGER] Error writing config:', err.message);
    return false;
  }
}

module.exports = {
  getConfig,
  saveConfig,
  configPath
};
