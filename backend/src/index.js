const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { syncSchema } = require('./db/migrate');
const http = require('http');
const { initSocket } = require('./socket');
const { ensureLicenseFileExists } = require('./services/licenseService');

// Initialize license file
ensureLicenseFileExists();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[API RESPONSE] ${req.method} ${req.url} ${res.statusCode} (${duration}ms)`);
  });
  console.log(`[API REQUEST] ${req.method} ${req.url}`);
  next();
});
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/hotel', require('./routes/hotel'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/tables', require('./routes/tables'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/guest', require('./routes/guest'));
app.use('/api/kitchen', require('./routes/kitchen'));

app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'BestBill API is running (Master Menu Update)' });
});

// Serve frontend dist static assets and fallback for guest network access
const fs = require('fs');
const distPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(distPath));
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    return next();
  }
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend not built. Please run npm run build.');
  }
});

const PORT = process.env.PORT || 8080;
const db = require('./db/db');

// --- AUTO CLEANUP TASK (2 DAYS / 1 YEAR) ---
const runCleanupTask = async () => {
    try {
        console.log('[CLEANUP] Starting daily history cleanup (Orders: 2 days, Bills: 1 year, Items: Today)...');
        
        // 1. Delete all unbilled orders older than 2 days (transient, active, or cancelled orders)
        const resUnbilledOrders = await db.query(
            "DELETE FROM orders WHERE id NOT IN (SELECT order_id FROM bills) AND created_at < datetime('now', '-2 days')"
        );
        
        // 2. Delete billing history (bills) older than 1 year
        const resBills = await db.query(
            "DELETE FROM bills WHERE created_at < datetime('now', '-1 year')"
        );
        
        // 3. Delete billed orders older than 1 year
        const resBilledOrders = await db.query(
            "DELETE FROM orders WHERE id IN (SELECT order_id FROM bills) AND created_at < datetime('now', '-1 year')"
        );

        // 4. Delete item sales details (order_items) that are older than today (local time)
        const resOrderItems = await db.query(
            "DELETE FROM order_items WHERE created_at < date('now', 'localtime')"
        );

        console.log(`[CLEANUP] Success: Removed ${resUnbilledOrders.rowCount} unbilled orders, ${resBills.rowCount} bills, ${resBilledOrders.rowCount} billed orders, and ${resOrderItems.rowCount} order items.`);
    } catch (err) {
        console.error('[CLEANUP] Error during cleanup:', err.message);
    }
};

// Run migrations before listening
syncSchema().then(() => {
    // Error handling middleware
    app.use((err, req, res, next) => {
        console.error('------- GLOBAL ERROR HANDLER -------');
        console.error('PATH:', req.path);
        console.error('METHOD:', req.method);
        console.error('ERROR:', err.message);
        console.error('STACK:', err.stack);
        console.error('------------------------------------');
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    });

    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT} (Socket.IO active)`);
        // Run first cleanup on start
        runCleanupTask();
        // Set up daily interval (24 hours)
        setInterval(runCleanupTask, 1000 * 60 * 60 * 24);
    }).on('error', (err) => {
        console.error('Server Listen Error:', err.message);
    });
});

// Anti-exit guard
setInterval(() => {}, 1000 * 60);
