const jwt = require('jsonwebtoken');
const db = require('../db/db');
const { isLicenseValid } = require('../services/licenseService');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No authentication token, access denied' });
    }

    const verified = jwt.verify(token, process.env.JWT_SECRET);
    if (!verified) {
      return res.status(401).json({ message: 'Token verification failed, access denied' });
    }

    // Removed admin bypass
      const { getLicenseDetails } = require('../services/licenseService');
      const details = getLicenseDetails();
      
      if (!details.isValid) {
        if (details.type === 'revoked') {
          return res.status(403).json({
            message: 'SERVICE_BLOCKED',
            reason: details.reason || 'ACCESS TERMINATED: Hardware access revoked by Super Admin.'
          });
        }
        if (details.type === 'suspended') {
          return res.status(403).json({
            message: 'OFFLINE_SUSPENDED',
            reason: details.reason || 'Your application has not been connected to the internet for 30 days. Please connect to the internet to verify your license.',
            contact_phone: '9822401802',
            contact_email: 'bestbillsolutions@gmail.com'
          });
        }
        if (details.type === 'trial') {
          const hotelResult = await db.query('SELECT created_at FROM hotels WHERE id = $1', [verified.hotel_id]);
          if (hotelResult.rows.length > 0) {
            const hotelCreated = new Date(hotelResult.rows[0].created_at);
            const trialDurationMs = 30 * 24 * 60 * 60 * 1000; // 30 days
            if (new Date() > new Date(hotelCreated.getTime() + trialDurationMs)) {
               return res.status(401).json({ message: 'Trial expired' });
            }
          }
        } else {
          return res.status(401).json({ message: 'Plan expired' });
        }
      }
    // End validation block

    req.user = verified;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Missing or invalid token' });
  }
};

module.exports = auth;
