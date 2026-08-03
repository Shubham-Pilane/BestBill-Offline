const express = require('express');
const db = require('../db/db');
const auth = require('../middleware/auth');
const router = express.Router();

// Helper to build date SQL conditions
function getDateFilterClause(filter, startDate, endDate, params) {
    if (filter === 'Today') {
        return `date(expense_date, 'localtime') = date('now', 'localtime')`;
    } else if (filter === 'Yesterday') {
        return `date(expense_date, 'localtime') = date('now', '-1 day', 'localtime')`;
    } else if (filter === 'Last 15 Days') {
        return `date(expense_date, 'localtime') >= date('now', '-14 days', 'localtime') AND date(expense_date, 'localtime') <= date('now', 'localtime')`;
    } else if (filter === 'Current Month') {
        return `strftime('%Y-%m', expense_date, 'localtime') = strftime('%Y-%m', 'now', 'localtime')`;
    } else if (filter === 'Last Month') {
        return `strftime('%Y-%m', expense_date, 'localtime') = strftime('%Y-%m', 'now', 'start of month', '-1 month')`;
    } else if (filter === 'Custom' && startDate && endDate) {
        params.push(startDate, endDate);
        const p1Index = params.length - 1;
        const p2Index = params.length;
        return `date(expense_date, 'localtime') >= date($${p1Index}) AND date(expense_date, 'localtime') <= date($${p2Index})`;
    }
    // Default to Today if invalid
    return `date(expense_date, 'localtime') = date('now', 'localtime')`;
}

// 1. Create a new expense
router.post('/', auth, async (req, res) => {
    const { title, description, amount, expense_date, category, payment_method } = req.body;
    
    if (!title || title.trim() === '') {
        return res.status(400).json({ message: 'Expense Title is required' });
    }
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: 'Valid Expense Amount is required' });
    }
    if (!payment_method || (payment_method !== 'Cash' && payment_method !== 'Online')) {
        return res.status(400).json({ message: 'Payment Method must be Cash or Online' });
    }

    try {
        const formattedDate = expense_date ? new Date(expense_date).toISOString() : new Date().toISOString();
        const createdBy = req.user.name || (req.user.role === 'owner' ? 'Owner' : 'Staff');
        const expenseCategory = (category && category.trim()) ? category.trim() : 'General';

        const insertRes = await db.query(
            `INSERT INTO expenses (hotel_id, title, description, amount, expense_date, category, payment_method, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
                req.user.hotel_id,
                title.trim(),
                description ? description.trim() : null,
                parseFloat(amount),
                formattedDate,
                expenseCategory,
                payment_method,
                createdBy
            ]
        );

        res.status(201).json({
            message: 'Expense recorded successfully',
            expense: insertRes.rows[0]
        });
    } catch (err) {
        console.error('[EXPENSES POST ERROR]', err);
        res.status(500).json({ message: 'Failed to record expense', error: err.message });
    }
});

// 2. Get paginated expenses with filters (10 records per page default)
router.get('/', auth, async (req, res) => {
    try {
        const filter = req.query.filter || 'Today';
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const params = [req.user.hotel_id];
        const dateClause = getDateFilterClause(filter, startDate, endDate, params);

        // Fetch count & total amount for filter
        const countQuery = `
            SELECT COUNT(*) as total_count, COALESCE(SUM(amount), 0) as total_amount
            FROM expenses
            WHERE hotel_id = $1 AND ${dateClause}
        `;
        const countRes = await db.query(countQuery, params);
        const totalCount = parseInt(countRes.rows[0]?.total_count || 0);
        const totalExpensesAmount = parseFloat(countRes.rows[0]?.total_amount || 0);
        const totalPages = Math.ceil(totalCount / limit) || 1;

        // Fetch paginated rows
        const queryParams = [...params, limit, offset];
        const limitParamIdx = queryParams.length - 1;
        const offsetParamIdx = queryParams.length;

        const dataQuery = `
            SELECT * FROM expenses
            WHERE hotel_id = $1 AND ${dateClause}
            ORDER BY expense_date DESC, created_at DESC
            LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
        `;

        const dataRes = await db.query(dataQuery, queryParams);

        res.json({
            expenses: dataRes.rows,
            totalCount,
            totalPages,
            currentPage: page,
            totalExpensesAmount
        });
    } catch (err) {
        console.error('[EXPENSES GET ERROR]', err);
        res.status(500).json({ message: 'Failed to fetch expenses', error: err.message });
    }
});

// 3. Get Expense Summary for Billing History / Dashboard integration
router.get('/summary', auth, async (req, res) => {
    try {
        const filter = req.query.filter || 'Today';
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;

        const params = [req.user.hotel_id];
        const dateClause = getDateFilterClause(filter, startDate, endDate, params);

        const summaryQuery = `
            SELECT 
                COALESCE(SUM(amount), 0) as total_expenses,
                COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN amount ELSE 0 END), 0) as cash_expenses,
                COALESCE(SUM(CASE WHEN payment_method = 'Online' THEN amount ELSE 0 END), 0) as online_expenses
            FROM expenses
            WHERE hotel_id = $1 AND ${dateClause}
        `;

        const resSummary = await db.query(summaryQuery, params);
        const row = resSummary.rows[0] || {};

        res.json({
            total_expenses: parseFloat(row.total_expenses || 0),
            cash_expenses: parseFloat(row.cash_expenses || 0),
            online_expenses: parseFloat(row.online_expenses || 0)
        });
    } catch (err) {
        console.error('[EXPENSES SUMMARY ERROR]', err);
        res.status(500).json({ message: 'Failed to fetch expense summary', error: err.message });
    }
});

// 4. Delete an expense
router.delete('/:id', auth, async (req, res) => {
    const { id } = req.params;
    try {
        const deleteRes = await db.query(
            'DELETE FROM expenses WHERE id = $1 AND hotel_id = $2 RETURNING id',
            [id, req.user.hotel_id]
        );
        if (deleteRes.rows.length === 0) {
            return res.status(404).json({ message: 'Expense record not found' });
        }
        res.json({ message: 'Expense deleted successfully' });
    } catch (err) {
        console.error('[EXPENSES DELETE ERROR]', err);
        res.status(500).json({ message: 'Failed to delete expense', error: err.message });
    }
});

module.exports = router;
