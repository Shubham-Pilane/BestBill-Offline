const fs = require('fs');
const path = require('path');

// Resolve path to AppData/Roaming/bestbill-desktop/config.json
const getDefaultConfigPath = () => {
  if (process.env.BESTBILL_DB_PATH) return path.join(path.dirname(process.env.BESTBILL_DB_PATH), 'config.json');
  const appData = process.env.APPDATA || (process.platform === 'darwin' 
    ? path.join(process.env.HOME, 'Library', 'Application Support') 
    : path.join(process.env.HOME, '.config'));
  return path.join(appData, 'bestbill-desktop', 'config.json');
};

const configPath = getDefaultConfigPath();

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
  },
  emailReportModuleEnabled: false,
  emailReportEnabled: false,
  emailReportProvider: "gmail",
  emailReportSender: "",
  emailReportPassword: "",
  emailReportRecipient: "",
  emailReportTime: "23:00",
  emailReportFrequency: "daily",
  emailReportSmtpHost: "smtp.gmail.com",
  emailReportSmtpPort: 465,
  emailReportSmtpSecure: true,
  lastEmailReportDate: "",
  cloudSyncEnabled: false,
  cloudSyncUrl: "https://vejvxpjswlmcsbfiqywp.supabase.co",
  cloudSyncAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlanZ4cGpzd2xtY3NiZmlxeXdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MzI3NTMsImV4cCI6MjEwMDEwODc1M30.oliBQIW9k8TL_d5q73bza7tt-CSK34yY-prJrYTfcBI",
  cloudSyncHotelCode: "HOTEL_001",
  cloudSyncOwnerEmail: "",
  cloudSyncOwnerPassword: "",
  cloudSyncIntervalMinutes: 15,
  lastCloudSyncTime: ""
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
    const parsed = JSON.parse(data);

    // Auto-heal legacy or invalid Supabase URLs
    if (!parsed.cloudSyncUrl || parsed.cloudSyncUrl.includes('vcjexpj')) {
      parsed.cloudSyncUrl = defaultConfig.cloudSyncUrl;
      parsed.cloudSyncAnonKey = defaultConfig.cloudSyncAnonKey;
      saveConfig(parsed);
    }

    return { ...defaultConfig, ...parsed };
  } catch (err) {
    console.error(`[CONFIG ERROR] Failed to load config.json:`, err.message);
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
