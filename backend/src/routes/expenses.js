const express = require('express');
const db = require('../db/db');
const auth = require('../middleware/auth');
const inventoryRepository = require('../repositories/inventoryRepository');
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
    } else if (filter === 'All Time') {
        return `1=1`;
    }
    return `date(expense_date, 'localtime') = date('now', 'localtime')`;
}

// 1. Create a new expense (General, Vendor, or Staff Salary)
router.post('/', auth, async (req, res) => {
    const { 
        title, 
        description, 
        amount, 
        expense_date, 
        category, 
        payment_method, 
        expense_type, 
        vendor_id, 
        vendor_name, 
        vendor_phone, 
        staff_name, 
        salary_month 
    } = req.body;
    
    if (!title || title.trim() === '') {
        return res.status(400).json({ message: 'Expense Title is required' });
    }
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: 'Valid Expense Amount is required' });
    }

    try {
        const formattedDate = expense_date ? new Date(expense_date).toISOString() : new Date().toISOString();
        const createdBy = req.user.name || (req.user.role === 'owner' ? 'Owner' : 'Staff');
        const expenseCategory = (category && category.trim()) ? category.trim() : 'General';
        const expType = expense_type || (vendor_name ? 'vendor' : (staff_name ? 'salary' : 'general'));

        let resolvedVendorId = vendor_id ? parseInt(vendor_id) : null;
        let vName = vendor_name ? vendor_name.trim() : null;
        let vPhone = vendor_phone ? vendor_phone.trim() : null;

        // Auto-save / link vendor if phone is provided
        if (vPhone) {
            const existingSupplier = await db.query(
                `SELECT * FROM suppliers WHERE hotel_id = $1 AND phone = $2`,
                [req.user.hotel_id, vPhone]
            );
            if (existingSupplier.rows.length > 0) {
                resolvedVendorId = existingSupplier.rows[0].id;
                vName = existingSupplier.rows[0].name || vName;
            } else if (vName) {
                const newSupplier = await inventoryRepository.createSupplier(req.user.hotel_id, {
                    name: vName,
                    phone: vPhone
                });
                if (newSupplier) resolvedVendorId = newSupplier.id;
            }
        }

        const insertRes = await db.query(
            `INSERT INTO expenses 
             (hotel_id, title, description, amount, expense_date, category, payment_method, created_by, expense_type, vendor_id, vendor_name, vendor_phone, staff_name, salary_month)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
            [
                req.user.hotel_id,
                title.trim(),
                description ? description.trim() : null,
                parseFloat(amount),
                formattedDate,
                expenseCategory,
                payment_method || 'Cash',
                createdBy,
                expType,
                resolvedVendorId,
                vName,
                vPhone,
                staff_name ? staff_name.trim() : null,
                salary_month ? salary_month.trim() : null
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

// 2. Get paginated expenses with filters
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

        const countQuery = `
            SELECT COUNT(*) as total_count, COALESCE(SUM(amount), 0) as total_amount
            FROM expenses
            WHERE hotel_id = $1 AND ${dateClause}
        `;
        const countRes = await db.query(countQuery, params);
        const totalCount = parseInt(countRes.rows[0]?.total_count || 0);
        const totalExpensesAmount = parseFloat(countRes.rows[0]?.total_amount || 0);
        const totalPages = Math.ceil(totalCount / limit) || 1;

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

// 3. Get Vendor Expenses Summaries (Grouped by Vendor)
router.get('/vendors/summary', auth, async (req, res) => {
    try {
        const query = `
            SELECT 
                COALESCE(vendor_name, 'Vendor Supplier') as vendor_name,
                vendor_phone,
                MAX(vendor_id) as vendor_id,
                COUNT(id) as total_entries,
                SUM(amount) as total_amount,
                MAX(expense_date) as last_expense_date
            FROM expenses
            WHERE hotel_id = $1 AND (expense_type = 'vendor' OR vendor_name IS NOT NULL OR vendor_phone IS NOT NULL)
            GROUP BY COALESCE(vendor_phone, vendor_name)
            ORDER BY total_amount DESC, last_expense_date DESC
        `;
        const result = await db.query(query, [req.user.hotel_id]);
        res.json(result.rows.map(r => ({
            ...r,
            total_entries: Number(r.total_entries || 0),
            total_amount: parseFloat(Number(r.total_amount || 0).toFixed(2))
        })));
    } catch (err) {
        console.error('[VENDOR SUMMARY ERROR]', err);
        res.status(500).json({ message: 'Failed to fetch vendor summaries', error: err.message });
    }
});

// 4. Get Detailed Expense Entries for a Specific Vendor
router.get('/vendors/:vendorKey', auth, async (req, res) => {
    try {
        const key = decodeURIComponent(req.params.vendorKey);
        if (!key || key === 'null' || key === 'undefined') {
            return res.json({ vendor_name: 'Vendor Details', vendor_phone: '', total_entries: 0, total_amount: 0, expenses: [] });
        }
        const isNumeric = !isNaN(key) && !isNaN(parseInt(key)) && Number.isInteger(Number(key));
        
        let queryStr;
        let params;
        if (isNumeric) {
            queryStr = `SELECT * FROM expenses WHERE hotel_id = $1 AND (vendor_id = $2 OR vendor_phone = $3 OR vendor_name = $4) ORDER BY expense_date DESC, created_at DESC`;
            params = [req.user.hotel_id, parseInt(key), key, key];
        } else {
            queryStr = `SELECT * FROM expenses WHERE hotel_id = $1 AND (vendor_phone = $2 OR vendor_name = $3) ORDER BY expense_date DESC, created_at DESC`;
            params = [req.user.hotel_id, key, key];
        }

        const result = await db.query(queryStr, params);
        
        const vendorName = result.rows[0]?.vendor_name || key;
        const vendorPhone = result.rows[0]?.vendor_phone || '';
        const totalAmount = result.rows.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

        res.json({
            vendor_name: vendorName,
            vendor_phone: vendorPhone,
            total_entries: result.rows.length,
            total_amount: parseFloat(totalAmount.toFixed(2)),
            expenses: result.rows
        });
    } catch (err) {
        console.error('[VENDOR DETAIL ERROR]', err);
        res.status(500).json({ message: 'Failed to fetch vendor expense records', error: err.message });
    }
});

// 5. Get Staff Salaries History
router.get('/staff-salary', auth, async (req, res) => {
    try {
        const query = `
            SELECT * FROM expenses 
            WHERE hotel_id = $1 AND (expense_type = 'salary' OR category = 'Salary' OR staff_name IS NOT NULL)
            ORDER BY expense_date DESC, created_at DESC
        `;
        const result = await db.query(query, [req.user.hotel_id]);
        res.json(result.rows);
    } catch (err) {
        console.error('[STAFF SALARY ERROR]', err);
        res.status(500).json({ message: 'Failed to fetch staff salary history', error: err.message });
    }
});

// 6. Get Expense Summary for Billing History / Dashboard integration
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

// 6b. Get Revenue Summary (Bills Revenue vs Total Expenses)
router.get('/revenue-summary', auth, async (req, res) => {
    try {
        const filter = req.query.filter || 'Today';
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;

        const expParams = [req.user.hotel_id];
        const expDateClause = getDateFilterClause(filter, startDate, endDate, expParams);
        const expRes = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE hotel_id = $1 AND ${expDateClause}`,
            expParams
        );
        const totalExpenses = parseFloat(expRes.rows[0]?.total_expenses || 0);

        const billParams = [req.user.hotel_id];
        let billDateClause = `1=1`;
        if (filter === 'Today') {
            billDateClause = `date(created_at, 'localtime') = date('now', 'localtime')`;
        } else if (filter === 'Yesterday') {
            billDateClause = `date(created_at, 'localtime') = date('now', '-1 day', 'localtime')`;
        } else if (filter === 'Last 15 Days') {
            billDateClause = `date(created_at, 'localtime') >= date('now', '-14 days', 'localtime') AND date(created_at, 'localtime') <= date('now', 'localtime')`;
        } else if (filter === 'Current Month') {
            billDateClause = `strftime('%Y-%m', created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')`;
        } else if (filter === 'Last Month') {
            billDateClause = `strftime('%Y-%m', created_at, 'localtime') = strftime('%Y-%m', 'now', 'start of month', '-1 month')`;
        } else if (filter === 'Custom' && startDate && endDate) {
            billParams.push(startDate, endDate);
            billDateClause = `date(created_at, 'localtime') >= date($2) AND date(created_at, 'localtime') <= date($3)`;
        } else if (filter === 'All Time') {
            billDateClause = `1=1`;
        } else {
            billDateClause = `date(created_at, 'localtime') = date('now', 'localtime')`;
        }

        const billRes = await db.query(
            `SELECT COALESCE(SUM(final_amount), 0) as total_revenue FROM bills WHERE hotel_id = $1 AND COALESCE(is_cancelled, 0) = 0 AND ${billDateClause}`,
            billParams
        );
        const totalRevenue = parseFloat(billRes.rows[0]?.total_revenue || 0);

        res.json({
            totalExpenses,
            totalRevenue,
            netRevenue: totalRevenue - totalExpenses
        });
    } catch (err) {
        console.error('[REVENUE SUMMARY ERROR]', err);
        res.status(500).json({ message: 'Failed to fetch revenue summary', error: err.message });
    }
});

// 7. Delete an expense
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
