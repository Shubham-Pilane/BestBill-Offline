const express = require('express');
const db = require('../db/db');
const auth = require('../middleware/auth');
const printService = require('../services/printService');
const router = express.Router();

// 1. Get paginated Cancelled Orders (10 records per page)
router.get('/', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const countRes = await db.query(
            'SELECT COUNT(*) as total_count FROM cancelled_orders WHERE hotel_id = $1',
            [req.user.hotel_id]
        );
        const totalCount = parseInt(countRes.rows[0]?.total_count || 0);
        const totalPages = Math.ceil(totalCount / limit) || 1;

        const dataRes = await db.query(
            `SELECT * FROM cancelled_orders 
             WHERE hotel_id = $1 
             ORDER BY cancel_date DESC, created_at DESC 
             LIMIT $2 OFFSET $3`,
            [req.user.hotel_id, limit, offset]
        );

        res.json({
            cancelledOrders: dataRes.rows,
            totalCount,
            totalPages,
            currentPage: page
        });
    } catch (err) {
        console.error('[CANCEL ORDERS GET ERROR]', err);
        res.status(500).json({ message: 'Failed to fetch cancelled orders', error: err.message });
    }
});

// 2. Get single Cancelled Order details
router.get('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const dataRes = await db.query(
            'SELECT * FROM cancelled_orders WHERE id = $1 AND hotel_id = $2',
            [id, req.user.hotel_id]
        );

        if (dataRes.rows.length === 0) {
            return res.status(404).json({ message: 'Cancelled order not found' });
        }

        const order = dataRes.rows[0];
        let items = [];
        try {
            items = JSON.parse(order.items_json);
        } catch (e) {}

        res.json({
            ...order,
            items
        });
    } catch (err) {
        console.error('[CANCEL ORDER GET DETAILS ERROR]', err);
        res.status(500).json({ message: 'Failed to fetch order details', error: err.message });
    }
});

// 3. Record a Cancelled Order
router.post('/', auth, async (req, res) => {
    const { 
        order_number, 
        table_id, 
        table_number, 
        floor, 
        items, 
        cancellation_reason, 
        kot_status, 
        billing_status 
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Cancelled order must have items' });
    }

    try {
        const cancelledBy = req.user.name || (req.user.role === 'owner' ? 'Owner' : 'Staff');
        const totalQuantity = items.reduce((sum, item) => sum + (parseInt(item.quantity || item.qty || 1)), 0);
        const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.price || 0) * parseInt(item.quantity || item.qty || 1)), 0);

        const orderNum = order_number || `ORD-${Date.now().toString().slice(-6)}`;
        const itemsJson = JSON.stringify(items);
        const kotStat = kot_status || 'Not Printed';
        const billStat = billing_status || 'Not Settled';

        const insertRes = await db.query(
            `INSERT INTO cancelled_orders 
             (hotel_id, order_number, table_id, table_number, floor, cancelled_by, items_json, total_quantity, total_amount, cancellation_reason, kot_status, billing_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING *`,
            [
                req.user.hotel_id,
                orderNum,
                table_id || null,
                table_number || 'Table',
                floor || 'Floor 1',
                cancelledBy,
                itemsJson,
                totalQuantity,
                totalAmount,
                cancellation_reason || '',
                kotStat,
                billStat
            ]
        );

        res.status(201).json({
            message: 'Cancelled order recorded successfully',
            cancelledOrder: insertRes.rows[0]
        });
    } catch (err) {
        console.error('[CANCEL ORDER POST ERROR]', err);
        res.status(500).json({ message: 'Failed to record cancelled order', error: err.message });
    }
});

// 4. Print Cancel Order Slip
router.post('/:id/print', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const dataRes = await db.query(
            'SELECT * FROM cancelled_orders WHERE id = $1 AND hotel_id = $2',
            [id, req.user.hotel_id]
        );

        if (dataRes.rows.length === 0) {
            return res.status(404).json({ message: 'Cancelled order not found' });
        }

        const cancelledOrder = dataRes.rows[0];
        let items = [];
        try {
            items = JSON.parse(cancelledOrder.items_json);
        } catch (e) {}

        const printed = printService.sendCancelOrder({
            hotelId: req.user.hotel_id,
            orderNumber: cancelledOrder.order_number,
            table: cancelledOrder.table_number,
            floor: cancelledOrder.floor,
            cancelledBy: cancelledOrder.cancelled_by,
            items,
            totalAmount: cancelledOrder.total_amount,
            kotStatus: cancelledOrder.kot_status,
            billingStatus: cancelledOrder.billing_status,
            cancellationReason: cancelledOrder.cancellation_reason,
            cancelDate: cancelledOrder.cancel_date
        });

        res.json({ success: true, message: 'Cancel order slip queued for printing' });
    } catch (err) {
        console.error('[CANCEL ORDER PRINT ERROR]', err);
        res.status(500).json({ message: 'Failed to print cancelled order', error: err.message });
    }
});

module.exports = router;
