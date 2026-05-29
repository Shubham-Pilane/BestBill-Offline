const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/db');
const multer = require('multer');
const upload = multer();
const router = express.Router();

// Register (Owner by default)
router.post('/register', upload.none(), async (req, res) => {
  const { name, email, password, hotelName, phone, address } = req.body;

  try {
    const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    let logoUrl = null;

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, email, hashedPassword, 'owner']
    );

    const userId = newUser.rows[0].id;

    const hotelRes = await db.query(
      'INSERT INTO hotels (owner_id, name, phone, location, logo_url) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [userId, hotelName || `${name}'s Hotel`, phone || null, address || null, logoUrl]
    );
    const newHotelId = hotelRes.rows[0].id;

    // Link the user directly to the new hotel
    await db.query('UPDATE users SET hotel_id = $1 WHERE id = $2', [newHotelId, userId]);

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const userResult = await db.query(
      `SELECT u.*, 
       COALESCE(h.name, h2.name) as hotel_name, 
       COALESCE(h.phone, h2.phone) as hotel_phone,
       COALESCE(h.location, h2.location) as hotel_location,
       COALESCE(h.upi_id, h2.upi_id) as upi_id, 
       COALESCE(h.subscription_valid_until, h2.subscription_valid_until) as subscription_valid_until,
       COALESCE(h.is_service_stopped, h2.is_service_stopped, false) as is_service_stopped,
       COALESCE(u.hotel_id, h2.id) as resolved_hotel_id,
       COALESCE(h.created_at, h2.created_at) as hotel_created_at
       FROM users u 
       LEFT JOIN hotels h ON u.hotel_id = h.id 
       LEFT JOIN hotels h2 ON h2.owner_id = u.id
       WHERE u.email = $1`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      console.log(`[AUTH] Password mismatch for ${email}`);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // --- Plan & Service Validation (skip for admin) ---
    if (user.role !== 'admin') {
      // Check if service is stopped by super admin
      if (user.is_service_stopped) {
        return res.status(403).json({ 
          message: 'SERVICE_BLOCKED',
          reason: 'Your hotel service has been temporarily suspended by the administrator. Please contact customer care.',
          contact_phone: '9822401802',
          contact_email: 'bestbillcustomercare@gmail.com'
        });
      }

      // Check Trial Period (Skip if License Key is valid)
      const { isLicenseValid } = require('../services/licenseService');
      const isActivated = isLicenseValid();

      if (!isActivated) {
        const hotelCreated = user.hotel_created_at ? new Date(user.hotel_created_at) : new Date(user.created_at);
        const trialDurationMs = 30 * 24 * 60 * 60 * 1000; // 30 days
        const expirationDate = new Date(hotelCreated.getTime() + trialDurationMs);
        const now = new Date();

        if (now > expirationDate) {
          console.warn(`[TRIAL EXPIRED] Login blocked for ${email}. Hotel registered at ${hotelCreated.toISOString()} has exceeded 30 days trial.`);
          return res.status(403).json({ 
            message: 'PLAN_EXPIRED',
            reason: 'Your 30-day offline free trial has expired. Please contact customer care (+91 9822401802) to activate your lifetime software license.',
            contact_phone: '9822401802',
            contact_email: 'bestbillcustomercare@gmail.com'
          });
        }
      }
    }

    const finalHotelId = user.resolved_hotel_id;

    const token = jwt.sign(
      { id: user.id, hotel_id: finalHotelId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const configManager = require('../config/configManager');
    const config = configManager.getConfig();

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role, 
        hotel_id: finalHotelId,
        hotel_name: user.hotel_name,
        hotel_phone: user.hotel_phone,
        hotel_location: user.hotel_location,
        upi_id: user.upi_id,
        subscription_valid_until: user.subscription_valid_until,
        lodgingEnabled: !!config.lodgingEnabled
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
  const { email, newPassword } = req.body;
  try {
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error updating password' });
  }
});

module.exports = router;
