const express = require('express');
const router = express.Router();
const db = require('../db/db');

// 1. Get Hotel Details & Menu for Guest (Public)
router.get('/hotel/:hotelId', async (req, res) => {
    try {
        const hotel = await db.query(
            'SELECT id, name, phone, location, logo_url, upi_id FROM hotels WHERE id = $1',
            [req.params.hotelId]
        );
        
        if (hotel.rows.length === 0) return res.status(404).json({ message: 'Hotel not found' });

        const categories = await db.query(
            'SELECT * FROM categories WHERE hotel_id = $1 ORDER BY name ASC',
            [req.params.hotelId]
        );

        const items = await db.query(
            'SELECT mi.*, c.name as category_name FROM menu_items mi JOIN categories c ON mi.category_id = c.id WHERE c.hotel_id = $1 AND mi.is_available = true',
            [req.params.hotelId]
        );

        res.json({
            hotel: hotel.rows[0],
            categories: categories.rows,
            menu: items.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching hotel menu' });
    }
});

// 2. Guest Place Order
router.post('/order', async (req, res) => {
    const { hotelId, guestName, guestPhone, roomNumber, items, note } = req.body;

    try {
        await db.query('BEGIN');

        // Verify room exists and is occupied/available
        const roomRes = await db.query(
            'SELECT id, status, guest_phone FROM rooms WHERE hotel_id = $1 AND room_number = $2',
            [hotelId, roomNumber]
        );

        if (roomRes.rows.length === 0) {
            return res.status(400).json({ message: `Room ${roomNumber} not found in this hotel.` });
        }

        const roomId = roomRes.rows[0].id;
        const registeredPhone = roomRes.rows[0].guest_phone;

        if (roomRes.rows[0].status === 'occupied') {
            const cleanInput = (guestPhone || '').replace(/\D/g, '').slice(-10);
            const cleanDb = (registeredPhone || '').replace(/\D/g, '').slice(-10);
            if (cleanInput !== cleanDb) {
                return res.status(401).json({ message: "Identity mismatch. Please use the number registered during check-in." });
            }
        } else {
            await db.query(`UPDATE rooms SET status = 'occupied', guest_name = $1, guest_phone = $2, check_in_date = CURRENT_TIMESTAMP WHERE id = $3`, [guestName, guestPhone, roomId]);
        }

        // Get or Create active order for this room
        let orderRes = await db.query(
            'SELECT id FROM orders WHERE room_id = $1 AND status = $2',
            [roomId, 'active']
        );

        let orderId;
        if (orderRes.rows.length === 0) {
            const newOrder = await db.query(
                "INSERT INTO orders (room_id, status, guest_note, source) VALUES ($1, $2, $3, 'guest') RETURNING id",
                [roomId, 'active', note]
            );
            orderId = newOrder.rows[0].id;
        } else {
            orderId = orderRes.rows[0].id;
            // Append note if it exists
            if (note) {
                await db.query(
                    "UPDATE orders SET guest_note = COALESCE(guest_note, '') || ' | ' || $1 WHERE id = $2",
                    [note, orderId]
                );
            }
            // IMPORTANT: If they already had a 'Delivered' order and they order again, 
            // we must make it 'Incoming' again for the owner, and ensure it's marked as 'guest' source.
            await db.query(
                "UPDATE orders SET is_delivered = false, owner_message = NULL, source = 'guest' WHERE id = $1",
                [orderId]
            );
        }

        // Insert items
        for (const item of items) {
            await db.query(
                'INSERT INTO order_items (order_id, menu_item_id, quantity) VALUES ($1, $2, $3)',
                [orderId, item.id, item.quantity]
            );
        }

        await db.query('COMMIT');
        res.status(201).json({ message: 'Order placed successfully! The kitchen is preparing your meal.' });
    } catch (err) {
        await db.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Failed to place order' });
    }
});

// 3. Guest check order status (for notifications and messaging)
router.get('/order-status-ext/:hotelId/:roomNumber', async (req, res) => {
    try {
        const order = await db.query(
            `SELECT 
                o.id, o.status, o.is_delivered, o.owner_message,
                (SELECT GROUP_CONCAT(quantity || 'x ' || name, ', ') 
                 FROM order_items oi 
                 JOIN menu_items mi ON oi.menu_item_id = mi.id 
                 WHERE oi.order_id = o.id) as items_summary,
                (SELECT SUM(oi.quantity * mi.price) 
                 FROM order_items oi 
                 JOIN menu_items mi ON oi.menu_item_id = mi.id 
                 WHERE oi.order_id = o.id) as total_amount
             FROM orders o 
             JOIN rooms r ON o.room_id = r.id 
             WHERE r.hotel_id = $1 AND r.room_number = $2 AND o.status = $3`,
            [req.params.hotelId, req.params.roomNumber, 'active']
        );
        res.json(order.rows[0] || null);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error checking order status' });
    }
});

// 4. Guest Send Message in Chat
router.post('/order/:orderId/chat', async (req, res) => {
    try {
        const { message } = req.body;
        await db.query(
            'INSERT INTO order_chats (order_id, sender, message) VALUES ($1, $2, $3)',
            [req.params.orderId, 'guest', message]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: 'Error sending message' });
    }
});

// 5. Guest Get Chat History
router.get('/order/:orderId/chat', async (req, res) => {
    try {
        const chats = await db.query(
            'SELECT * FROM order_chats WHERE order_id = $1 ORDER BY created_at ASC',
            [req.params.orderId]
        );
        res.json(chats.rows);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching chat' });
    }
});

// 6. Verify Guest Identity (New Security Step)
router.post('/verify-guest', async (req, res) => {
    const { hotelId, roomNumber, phone } = req.body;
    try {
        const roomRes = await db.query(
            'SELECT * FROM rooms WHERE hotel_id = $1 AND room_number = $2 AND status = $3',
            [hotelId, roomNumber, 'occupied']
        );
        
        if (roomRes.rows.length === 0) {
            return res.status(401).json({ 
                message: `Room ${roomNumber} is not currently active. Have you checked in at the reception?` 
            });
        }
        
        const room = roomRes.rows[0];
        
        // Match numbers while ignoring spaces, dashes, or + symbols
        const cleanInputPhone = phone.replace(/\D/g, '');
        const cleanDbPhone = (room.guest_phone || '').replace(/\D/g, '');

        // Match only last 10 digits to be extra safe with +91 prefixes
        const inputSuffix = cleanInputPhone.slice(-10);
        const dbSuffix = cleanDbPhone.slice(-10);

        if (inputSuffix !== dbSuffix) {
            return res.status(401).json({ 
                message: 'Phone number mismatch. Please enter the primary number registered during check-in.' 
            });
        }

        res.json({ 
            success: true, 
            guest_name: room.guest_name,
            message: `Identity Verified: Welcome, ${room.guest_name}!`
        });
    } catch (err) {
        res.status(500).json({ message: 'Verification server error' });
    }
});

module.exports = router;
