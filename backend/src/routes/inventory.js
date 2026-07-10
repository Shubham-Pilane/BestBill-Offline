const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db/db');
const inventoryRepository = require('../repositories/inventoryRepository');
const inventoryService = require('../services/inventoryService');

// --- CATEGORIES CRUD ---

router.post('/categories', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Category name is required' });
    const category = await inventoryRepository.createCategory(req.user.hotel_id, name);
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ message: 'Error creating category', error: err.message });
  }
});

router.get('/categories', auth, async (req, res) => {
  try {
    const categories = await inventoryRepository.getCategories(req.user.hotel_id);
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching categories', error: err.message });
  }
});

router.put('/categories/:id', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Category name is required' });
    const category = await inventoryRepository.updateCategory(req.user.hotel_id, req.params.id, name);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json(category);
  } catch (err) {
    res.status(500).json({ message: 'Error updating category', error: err.message });
  }
});

router.delete('/categories/:id', auth, async (req, res) => {
  try {
    const success = await inventoryRepository.deleteCategory(req.user.hotel_id, req.params.id);
    if (!success) return res.status(404).json({ message: 'Category not found' });
    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting category', error: err.message });
  }
});

// --- ITEMS CRUD ---

router.post('/items', auth, async (req, res) => {
  try {
    const { category_id, name, unit, current_stock, minimum_stock, purchase_rate } = req.body;
    if (!name || !unit) return res.status(400).json({ message: 'Name and Unit are required' });

    const baseStock = inventoryService.toBaseUnit(current_stock || 0, unit);
    const baseMinStock = inventoryService.toBaseUnit(minimum_stock || 0, unit);

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const newItem = await inventoryRepository.createItem(
        req.user.hotel_id,
        {
          category_id,
          name,
          unit,
          current_stock: baseStock,
          minimum_stock: baseMinStock,
          purchase_rate: purchase_rate || 0
        },
        client
      );

      // Record ledger entry for initial stock if positive
      if (baseStock > 0) {
        await inventoryRepository.createTransaction(
          req.user.hotel_id,
          {
            inventory_item_id: newItem.id,
            transaction_type: 'ADJUSTMENT',
            quantity: baseStock,
            remarks: 'Initial stock setup'
          },
          client
        );
      }

      await client.query('COMMIT');

      // Convert back to display units
      res.status(201).json({
        ...newItem,
        current_stock: current_stock || 0,
        minimum_stock: minimum_stock || 0
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ message: 'Error creating item', error: err.message });
  }
});

router.get('/items', auth, async (req, res) => {
  try {
    const items = await inventoryRepository.getItems(req.user.hotel_id);
    // Convert to display units
    const formatted = items.map(item => ({
      ...item,
      current_stock: inventoryService.fromBaseUnit(item.current_stock, item.unit),
      minimum_stock: inventoryService.fromBaseUnit(item.minimum_stock, item.unit)
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching items', error: err.message });
  }
});

router.get('/items/:id', auth, async (req, res) => {
  try {
    const item = await inventoryRepository.getItemById(req.user.hotel_id, req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    
    res.json({
      ...item,
      current_stock: inventoryService.fromBaseUnit(item.current_stock, item.unit),
      minimum_stock: inventoryService.fromBaseUnit(item.minimum_stock, item.unit)
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching item details', error: err.message });
  }
});

router.put('/items/:id', auth, async (req, res) => {
  try {
    const { category_id, name, unit, current_stock, minimum_stock, purchase_rate } = req.body;
    if (!name || !unit) return res.status(400).json({ message: 'Name and Unit are required' });

    const baseStock = inventoryService.toBaseUnit(current_stock || 0, unit);
    const baseMinStock = inventoryService.toBaseUnit(minimum_stock || 0, unit);

    const updated = await inventoryRepository.updateItem(
      req.user.hotel_id,
      req.params.id,
      {
        category_id,
        name,
        unit,
        current_stock: baseStock,
        minimum_stock: baseMinStock,
        purchase_rate: purchase_rate || 0
      }
    );

    if (!updated) return res.status(404).json({ message: 'Item not found' });

    res.json({
      ...updated,
      current_stock: current_stock || 0,
      minimum_stock: minimum_stock || 0
    });
  } catch (err) {
    res.status(500).json({ message: 'Error updating item', error: err.message });
  }
});

router.delete('/items/:id', auth, async (req, res) => {
  try {
    const success = await inventoryRepository.deleteItem(req.user.hotel_id, req.params.id);
    if (!success) return res.status(404).json({ message: 'Item not found' });
    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting item', error: err.message });
  }
});

// --- SUPPLIERS CRUD ---

router.post('/suppliers', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'Supplier name is required' });
    const supplier = await inventoryRepository.createSupplier(req.user.hotel_id, req.body);
    res.status(201).json(supplier);
  } catch (err) {
    res.status(500).json({ message: 'Error creating supplier', error: err.message });
  }
});

router.get('/suppliers', auth, async (req, res) => {
  try {
    const suppliers = await inventoryRepository.getSuppliers(req.user.hotel_id);
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching suppliers', error: err.message });
  }
});

router.put('/suppliers/:id', auth, async (req, res) => {
  try {
    const supplier = await inventoryRepository.updateSupplier(req.user.hotel_id, req.params.id, req.body);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ message: 'Error updating supplier', error: err.message });
  }
});

router.delete('/suppliers/:id', auth, async (req, res) => {
  try {
    const success = await inventoryRepository.deleteSupplier(req.user.hotel_id, req.params.id);
    if (!success) return res.status(404).json({ message: 'Supplier not found' });
    res.json({ message: 'Supplier deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting supplier', error: err.message });
  }
});

// --- PURCHASES ---

router.post('/purchases', auth, async (req, res) => {
  try {
    const entry = await inventoryService.savePurchaseEntry(req.user.hotel_id, req.body);
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ message: 'Error recording purchase entry', error: err.message });
  }
});

router.get('/purchases', auth, async (req, res) => {
  try {
    const entries = await inventoryRepository.getPurchaseEntries(req.user.hotel_id, req.query);
    res.json(entries);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving purchase entries', error: err.message });
  }
});

router.get('/purchases/:id', auth, async (req, res) => {
  try {
    const entry = await inventoryRepository.getPurchaseEntryById(req.user.hotel_id, req.params.id);
    if (!entry) return res.status(404).json({ message: 'Purchase entry not found' });

    // Format quantities back to display units
    entry.items = entry.items.map(item => ({
      ...item,
      quantity: inventoryService.fromBaseUnit(item.quantity, item.unit)
    }));

    res.json(entry);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving purchase details', error: err.message });
  }
});

// --- RECIPES ---

router.post('/recipes', auth, async (req, res) => {
  try {
    const recipe = await inventoryService.saveRecipe(req.user.hotel_id, req.body);
    res.status(201).json(recipe);
  } catch (err) {
    res.status(500).json({ message: 'Error mapping recipe', error: err.message });
  }
});

router.get('/recipes', auth, async (req, res) => {
  try {
    const recipes = await inventoryRepository.getRecipes(req.user.hotel_id);
    res.json(recipes);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching recipes', error: err.message });
  }
});

router.get('/recipes/:id', auth, async (req, res) => {
  try {
    const recipe = await inventoryRepository.getRecipeById(req.user.hotel_id, req.params.id);
    if (!recipe) return res.status(404).json({ message: 'Recipe not found' });

    // Convert recipe items back to display units
    recipe.items = recipe.items.map(item => ({
      ...item,
      quantity_required: inventoryService.fromBaseUnit(item.quantity_required, item.unit)
    }));

    res.json(recipe);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching recipe details', error: err.message });
  }
});

router.get('/recipes/product/:productId', auth, async (req, res) => {
  try {
    const recipe = await inventoryRepository.getRecipeByProductId(req.user.hotel_id, req.params.productId);
    if (!recipe) return res.json(null);

    // Convert recipe items back to display units
    recipe.items = recipe.items.map(item => ({
      ...item,
      quantity_required: inventoryService.fromBaseUnit(item.quantity_required, item.unit)
    }));

    res.json(recipe);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching product recipe', error: err.message });
  }
});

router.delete('/recipes/:id', auth, async (req, res) => {
  try {
    const success = await inventoryRepository.deleteRecipe(req.user.hotel_id, req.params.id);
    if (!success) return res.status(404).json({ message: 'Recipe not found' });
    res.json({ message: 'Recipe deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting recipe', error: err.message });
  }
});

// --- STOCK ADJUSTMENT ---

router.post('/adjustments', auth, async (req, res) => {
  try {
    const result = await inventoryService.saveStockAdjustment(req.user.hotel_id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Error saving stock adjustment', error: err.message });
  }
});

// --- WASTAGE ENTRY ---

router.post('/wastage', auth, async (req, res) => {
  try {
    const result = await inventoryService.saveWastage(req.user.hotel_id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Error recording wastage', error: err.message });
  }
});

// --- INVENTORY DASHBOARD ---

router.get('/dashboard', auth, async (req, res) => {
  try {
    const stats = await inventoryService.getDashboardData(req.user.hotel_id);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching dashboard metrics', error: err.message });
  }
});

// --- REPORTS ENDPOINTS ---

// 1. Stock Ledger Report
router.get('/reports/ledger', auth, async (req, res) => {
  try {
    const { itemId, startDate, endDate } = req.query;
    if (!itemId) return res.status(400).json({ message: 'Item ID is required for ledger' });

    // Fetch ledger using helper logic to construct correct running balance
    const allTransactions = await db.query(
      `SELECT st.*, ii.unit, ii.name as item_name 
       FROM stock_transactions st
       JOIN inventory_items ii ON st.inventory_item_id = ii.id
       WHERE st.hotel_id = $1 AND st.inventory_item_id = $2
       ORDER BY st.created_at ASC`,
      [req.user.hotel_id, itemId]
    );

    let runningBalance = 0;
    const report = [];

    for (const tx of allTransactions.rows) {
      const qty = parseFloat(tx.quantity);
      runningBalance += qty;

      const txDateStr = tx.created_at.split(' ')[0]; // Extract YYYY-MM-DD
      let matches = true;
      if (startDate && txDateStr < startDate) matches = false;
      if (endDate && txDateStr > endDate) matches = false;

      if (matches) {
        report.push({
          id: tx.id,
          date: tx.created_at,
          type: tx.transaction_type,
          quantity: inventoryService.fromBaseUnit(qty, tx.unit),
          balance: inventoryService.fromBaseUnit(runningBalance, tx.unit),
          unit: tx.unit,
          remarks: tx.remarks
        });
      }
    }

    res.json(report.reverse()); // return newest first
  } catch (err) {
    res.status(500).json({ message: 'Error generating stock ledger report', error: err.message });
  }
});

// 2. Current Stock Report
router.get('/reports/current-stock', auth, async (req, res) => {
  try {
    const items = await inventoryRepository.getItems(req.user.hotel_id);
    const report = items.map(item => {
      const current = inventoryService.fromBaseUnit(item.current_stock, item.unit);
      const min = inventoryService.fromBaseUnit(item.minimum_stock, item.unit);
      return {
        item_id: item.id,
        name: item.name,
        current_stock: Number(current.toFixed(4)),
        minimum_stock: Number(min.toFixed(4)),
        unit: item.unit,
        is_low: current <= min
      };
    });
    res.json(report);
  } catch (err) {
    res.status(500).json({ message: 'Error generating current stock report', error: err.message });
  }
});

// 3. Purchase Report
router.get('/reports/purchases', auth, async (req, res) => {
  try {
    const { startDate, endDate, supplierId } = req.query;
    const entries = await inventoryRepository.getPurchaseEntries(req.user.hotel_id, {
      supplierId,
      startDate,
      endDate
    });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ message: 'Error generating purchase report', error: err.message });
  }
});

// 4. Consumption Report (consumed through sales)
router.get('/reports/consumption', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let queryStr = `
      SELECT st.inventory_item_id, ii.name, ii.unit, COALESCE(SUM(ABS(st.quantity)), 0) as consumed_qty
      FROM stock_transactions st
      JOIN inventory_items ii ON st.inventory_item_id = ii.id
      WHERE st.hotel_id = $1 AND st.transaction_type = 'SALE'
    `;
    const params = [req.user.hotel_id];
    let paramIdx = 2;

    if (startDate) {
      queryStr += ` AND st.created_at >= $${paramIdx++}`;
      params.push(startDate);
    }
    if (endDate) {
      queryStr += ` AND st.created_at <= $${paramIdx++}`;
      params.push(endDate);
    }

    queryStr += ' GROUP BY st.inventory_item_id, ii.name, ii.unit';

    const result = await db.query(queryStr, params);
    
    const formatted = result.rows.map(row => ({
      item_id: row.inventory_item_id,
      name: row.name,
      consumed_quantity: inventoryService.fromBaseUnit(row.consumed_qty, row.unit),
      unit: row.unit
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: 'Error generating consumption report', error: err.message });
  }
});

// 5. Low Stock Report
router.get('/reports/low-stock', auth, async (req, res) => {
  try {
    const items = await inventoryRepository.getItems(req.user.hotel_id);
    const lowStock = items
      .map(item => ({
        item_id: item.id,
        name: item.name,
        current_stock: inventoryService.fromBaseUnit(item.current_stock, item.unit),
        minimum_stock: inventoryService.fromBaseUnit(item.minimum_stock, item.unit),
        unit: item.unit
      }))
      .filter(item => item.current_stock <= item.minimum_stock);

    res.json(lowStock);
  } catch (err) {
    res.status(500).json({ message: 'Error generating low stock report', error: err.message });
  }
});

// 6. Wastage Report
router.get('/reports/wastage', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let queryStr = `
      SELECT st.*, ii.name as item_name, ii.unit
      FROM stock_transactions st
      JOIN inventory_items ii ON st.inventory_item_id = ii.id
      WHERE st.hotel_id = $1 AND st.transaction_type = 'WASTAGE'
    `;
    const params = [req.user.hotel_id];
    let paramIdx = 2;

    if (startDate) {
      queryStr += ` AND st.created_at >= $${paramIdx++}`;
      params.push(startDate);
    }
    if (endDate) {
      queryStr += ` AND st.created_at <= $${paramIdx++}`;
      params.push(endDate);
    }

    queryStr += ' ORDER BY st.created_at DESC';

    const resTx = await db.query(queryStr, params);

    const report = resTx.rows.map(tx => ({
      id: tx.id,
      date: tx.created_at,
      item_name: tx.item_name,
      quantity: inventoryService.fromBaseUnit(Math.abs(tx.quantity), tx.unit),
      unit: tx.unit,
      reason: tx.remarks
    }));

    res.json(report);
  } catch (err) {
    res.status(500).json({ message: 'Error generating wastage report', error: err.message });
  }
});

// 7. Inventory Valuation Report
router.get('/reports/valuation', auth, async (req, res) => {
  try {
    const items = await inventoryRepository.getItems(req.user.hotel_id);
    let overallValuation = 0;

    const itemsReport = items.map(item => {
      const current = inventoryService.fromBaseUnit(item.current_stock, item.unit);
      const valuation = current * Number(item.purchase_rate || 0);
      overallValuation += valuation;

      return {
        item_id: item.id,
        name: item.name,
        current_stock: Number(current.toFixed(4)),
        unit: item.unit,
        purchase_rate: Number(item.purchase_rate),
        valuation: Number(valuation.toFixed(2))
      };
    });

    res.json({
      items: itemsReport,
      total_valuation: Number(overallValuation.toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ message: 'Error generating inventory valuation report', error: err.message });
  }
});

// 8. General Transactions Report (ledger history for all items)
router.get('/reports/transactions', auth, async (req, res) => {
  try {
    const { startDate, endDate, type, itemId } = req.query;

    let queryStr = `
      SELECT st.*, ii.name as item_name, ii.unit
      FROM stock_transactions st
      JOIN inventory_items ii ON st.inventory_item_id = ii.id
      WHERE st.hotel_id = $1
    `;
    const params = [req.user.hotel_id];
    let paramIdx = 2;

    if (itemId) {
      queryStr += ` AND st.inventory_item_id = $${paramIdx++}`;
      params.push(parseInt(itemId));
    }

    if (type) {
      queryStr += ` AND st.transaction_type = $${paramIdx++}`;
      params.push(type);
    }

    queryStr += ' ORDER BY st.created_at DESC';

    const result = await db.query(queryStr, params);

    const report = [];
    for (const tx of result.rows) {
      const txDateStr = tx.created_at.split(' ')[0];
      let matches = true;
      if (startDate && txDateStr < startDate) matches = false;
      if (endDate && txDateStr > endDate) matches = false;

      if (matches) {
        report.push({
          id: tx.id,
          date: tx.created_at,
          item_id: tx.inventory_item_id,
          item_name: tx.item_name,
          type: tx.transaction_type,
          quantity: inventoryService.fromBaseUnit(tx.quantity, tx.unit),
          unit: tx.unit,
          remarks: tx.remarks,
          reference_type: tx.reference_type,
          reference_id: tx.reference_id
        });
      }
    }

    res.json(report);
  } catch (err) {
    res.status(500).json({ message: 'Error generating general transactions report', error: err.message });
  }
});

module.exports = router;
