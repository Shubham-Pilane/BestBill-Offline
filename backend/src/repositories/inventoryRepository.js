const db = require('../db/db');

class InventoryRepository {
  // --- INVENTORY CATEGORIES ---
  async createCategory(hotelId, name, client) {
    const q = client || db;
    const res = await q.query(
      'INSERT INTO inventory_categories (hotel_id, name) VALUES ($1, $2) RETURNING *',
      [hotelId, name]
    );
    return res.rows[0];
  }

  async getCategories(hotelId) {
    const res = await db.query(
      'SELECT * FROM inventory_categories WHERE hotel_id = $1 ORDER BY name ASC',
      [hotelId]
    );
    return res.rows;
  }

  async getCategoryById(hotelId, id) {
    const res = await db.query(
      'SELECT * FROM inventory_categories WHERE hotel_id = $1 AND id = $2',
      [hotelId, id]
    );
    return res.rows[0];
  }

  async updateCategory(hotelId, id, name) {
    const res = await db.query(
      'UPDATE inventory_categories SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE hotel_id = $2 AND id = $3 RETURNING *',
      [name, hotelId, id]
    );
    return res.rows[0];
  }

  async deleteCategory(hotelId, id) {
    // Before deleting category, set related inventory item category_ids to NULL
    await db.query(
      'UPDATE inventory_items SET category_id = NULL WHERE hotel_id = $1 AND category_id = $2',
      [hotelId, id]
    );
    const res = await db.query(
      'DELETE FROM inventory_categories WHERE hotel_id = $1 AND id = $2 RETURNING *',
      [hotelId, id]
    );
    return res.rowCount > 0;
  }

  // --- INVENTORY ITEMS ---
  async createItem(hotelId, data, client) {
    const q = client || db;
    const { category_id, name, unit, current_stock = 0, minimum_stock = 0, purchase_rate = 0 } = data;
    const res = await q.query(
      `INSERT INTO inventory_items (hotel_id, category_id, name, unit, current_stock, minimum_stock, purchase_rate) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [hotelId, category_id, name, unit, current_stock, minimum_stock, purchase_rate]
    );
    return res.rows[0];
  }

  async getItems(hotelId) {
    const res = await db.query(
      `SELECT ii.*, ic.name as category_name 
       FROM inventory_items ii
       LEFT JOIN inventory_categories ic ON ii.category_id = ic.id
       WHERE ii.hotel_id = $1 
       ORDER BY ii.name ASC`,
      [hotelId]
    );
    return res.rows;
  }

  async getItemById(hotelId, id, client) {
    const q = client || db;
    const res = await q.query(
      `SELECT ii.*, ic.name as category_name 
       FROM inventory_items ii
       LEFT JOIN inventory_categories ic ON ii.category_id = ic.id
       WHERE ii.hotel_id = $1 AND ii.id = $2`,
      [hotelId, id]
    );
    return res.rows[0];
  }

  async updateItem(hotelId, id, data, client) {
    const q = client || db;
    const { category_id, name, unit, current_stock, minimum_stock, purchase_rate } = data;
    const res = await q.query(
      `UPDATE inventory_items 
       SET category_id = $1, name = $2, unit = $3, current_stock = $4, minimum_stock = $5, purchase_rate = $6, updated_at = CURRENT_TIMESTAMP
       WHERE hotel_id = $7 AND id = $8 RETURNING *`,
      [category_id, name, unit, current_stock, minimum_stock, purchase_rate, hotelId, id]
    );
    return res.rows[0];
  }

  async updateStock(hotelId, id, quantityChange, client) {
    const q = client || db;
    const res = await q.query(
      `UPDATE inventory_items 
       SET current_stock = current_stock + $1, updated_at = CURRENT_TIMESTAMP
       WHERE hotel_id = $2 AND id = $3 RETURNING *`,
      [quantityChange, hotelId, id]
    );
    return res.rows[0];
  }

  async deleteItem(hotelId, id) {
    const res = await db.query(
      'DELETE FROM inventory_items WHERE hotel_id = $1 AND id = $2 RETURNING *',
      [hotelId, id]
    );
    return res.rowCount > 0;
  }

  // --- SUPPLIERS ---
  async createSupplier(hotelId, data) {
    const { name, phone, email, address, gst_number } = data;
    const res = await db.query(
      `INSERT INTO suppliers (hotel_id, name, phone, email, address, gst_number) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [hotelId, name, phone, email, address, gst_number]
    );
    return res.rows[0];
  }

  async getSuppliers(hotelId) {
    const res = await db.query(
      'SELECT * FROM suppliers WHERE hotel_id = $1 ORDER BY name ASC',
      [hotelId]
    );
    return res.rows;
  }

  async getSupplierById(hotelId, id) {
    const res = await db.query(
      'SELECT * FROM suppliers WHERE hotel_id = $1 AND id = $2',
      [hotelId, id]
    );
    return res.rows[0];
  }

  async updateSupplier(hotelId, id, data) {
    const { name, phone, email, address, gst_number } = data;
    const res = await db.query(
      `UPDATE suppliers 
       SET name = $1, phone = $2, email = $3, address = $4, gst_number = $5 
       WHERE hotel_id = $6 AND id = $7 RETURNING *`,
      [name, phone, email, address, gst_number, hotelId, id]
    );
    return res.rows[0];
  }

  async deleteSupplier(hotelId, id) {
    // Nullify supplier reference in purchase entries before deletion
    await db.query(
      'UPDATE purchase_entries SET supplier_id = NULL WHERE hotel_id = $1 AND supplier_id = $2',
      [hotelId, id]
    );
    const res = await db.query(
      'DELETE FROM suppliers WHERE hotel_id = $1 AND id = $2 RETURNING *',
      [hotelId, id]
    );
    return res.rowCount > 0;
  }

  // --- PURCHASE ENTRIES & ITEMS ---
  async createPurchaseEntry(hotelId, data, client) {
    const q = client || db;
    const { supplier_id, invoice_number, invoice_date, total_amount } = data;
    const res = await q.query(
      `INSERT INTO purchase_entries (hotel_id, supplier_id, invoice_number, invoice_date, total_amount) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [hotelId, supplier_id, invoice_number, invoice_date, total_amount]
    );
    return res.rows[0];
  }

  async createPurchaseEntryItem(data, client) {
    const q = client || db;
    const { purchase_entry_id, inventory_item_id, quantity, rate, amount } = data;
    const res = await q.query(
      `INSERT INTO purchase_entry_items (purchase_entry_id, inventory_item_id, quantity, rate, amount) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [purchase_entry_id, inventory_item_id, quantity, rate, amount]
    );
    return res.rows[0];
  }

  async getPurchaseEntries(hotelId, filters = {}) {
    const { supplierId, startDate, endDate } = filters;
    let queryStr = `
      SELECT pe.*, s.name as supplier_name 
      FROM purchase_entries pe
      LEFT JOIN suppliers s ON pe.supplier_id = s.id
      WHERE pe.hotel_id = $1
    `;
    const params = [hotelId];
    let paramIndex = 2;

    if (supplierId) {
      queryStr += ` AND pe.supplier_id = $${paramIndex++}`;
      params.push(supplierId);
    }
    if (startDate) {
      queryStr += ` AND pe.invoice_date >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      queryStr += ` AND pe.invoice_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    queryStr += ' ORDER BY pe.invoice_date DESC, pe.created_at DESC';

    const res = await db.query(queryStr, params);
    return res.rows;
  }

  async getPurchaseEntryById(hotelId, id) {
    const peRes = await db.query(
      `SELECT pe.*, s.name as supplier_name, s.phone as supplier_phone, s.gst_number as supplier_gst
       FROM purchase_entries pe
       LEFT JOIN suppliers s ON pe.supplier_id = s.id
       WHERE pe.hotel_id = $1 AND pe.id = $2`,
      [hotelId, id]
    );

    if (peRes.rows.length === 0) return null;

    const itemsRes = await db.query(
      `SELECT pei.*, ii.name as item_name, ii.unit 
       FROM purchase_entry_items pei
       JOIN inventory_items ii ON pei.inventory_item_id = ii.id
       WHERE pei.purchase_entry_id = $1`,
      [id]
    );

    return {
      ...peRes.rows[0],
      items: itemsRes.rows
    };
  }

  // --- STOCK TRANSACTIONS ---
  async createTransaction(hotelId, data, client) {
    const q = client || db;
    const { inventory_item_id, transaction_type, quantity, reference_type, reference_id, remarks } = data;
    const res = await q.query(
      `INSERT INTO stock_transactions (hotel_id, inventory_item_id, transaction_type, quantity, reference_type, reference_id, remarks) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [hotelId, inventory_item_id, transaction_type, quantity, reference_type, reference_id, remarks]
    );
    return res.rows[0];
  }

  async getTransactions(hotelId, filters = {}) {
    const { itemId, type, startDate, endDate } = filters;
    let queryStr = `
      SELECT st.*, ii.name as item_name, ii.unit
      FROM stock_transactions st
      JOIN inventory_items ii ON st.inventory_item_id = ii.id
      WHERE st.hotel_id = $1
    `;
    const params = [hotelId];
    let paramIndex = 2;

    if (itemId) {
      queryStr += ` AND st.inventory_item_id = $${paramIndex++}`;
      params.push(itemId);
    }
    if (type) {
      queryStr += ` AND st.transaction_type = $${paramIndex++}`;
      params.push(type);
    }
    if (startDate) {
      queryStr += ` AND st.created_at >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      queryStr += ` AND st.created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    queryStr += ' ORDER BY st.created_at DESC';

    const res = await db.query(queryStr, params);
    return res.rows;
  }

  // --- RECIPES & RECIPE ITEMS ---
  async createRecipe(hotelId, productId, client) {
    const q = client || db;
    const res = await q.query(
      `INSERT INTO recipes (hotel_id, product_id) 
       VALUES ($1, $2) 
       ON CONFLICT (hotel_id, product_id) DO UPDATE SET created_at = CURRENT_TIMESTAMP 
       RETURNING *`,
      [hotelId, productId]
    );
    return res.rows[0];
  }

  async getRecipes(hotelId) {
    const res = await db.query(
      `SELECT r.*, mi.name as product_name, mi.price as product_price,
              (SELECT COUNT(*) FROM recipe_items ri WHERE ri.recipe_id = r.id) as ingredient_count
       FROM recipes r
       JOIN menu_items mi ON r.product_id = mi.id
       WHERE r.hotel_id = $1
       ORDER BY mi.name ASC`,
      [hotelId]
    );
    return res.rows;
  }

  async getRecipeById(hotelId, id, client) {
    const q = client || db;
    const rRes = await q.query(
      `SELECT r.*, mi.name as product_name 
       FROM recipes r
       JOIN menu_items mi ON r.product_id = mi.id
       WHERE r.hotel_id = $1 AND r.id = $2`,
      [hotelId, id]
    );

    if (rRes.rows.length === 0) return null;

    const itemsRes = await q.query(
      `SELECT ri.*, ii.name as item_name, ii.unit
       FROM recipe_items ri
       JOIN inventory_items ii ON ri.inventory_item_id = ii.id
       WHERE ri.recipe_id = $1`,
      [id]
    );

    return {
      ...rRes.rows[0],
      items: itemsRes.rows
    };
  }

  async getRecipeByProductId(hotelId, productId, client) {
    const q = client || db;
    const rRes = await q.query(
      `SELECT r.*, mi.name as product_name 
       FROM recipes r
       JOIN menu_items mi ON r.product_id = mi.id
       WHERE r.hotel_id = $1 AND r.product_id = $2`,
      [hotelId, productId]
    );

    if (rRes.rows.length === 0) return null;

    const itemsRes = await q.query(
      `SELECT ri.*, ii.name as item_name, ii.unit
       FROM recipe_items ri
       JOIN inventory_items ii ON ri.inventory_item_id = ii.id
       WHERE ri.recipe_id = $1`,
      [rRes.rows[0].id]
    );

    return {
      ...rRes.rows[0],
      items: itemsRes.rows
    };
  }

  async deleteRecipe(hotelId, id) {
    const res = await db.query(
      'DELETE FROM recipes WHERE hotel_id = $1 AND id = $2 RETURNING *',
      [hotelId, id]
    );
    return res.rowCount > 0;
  }

  async createRecipeItem(data, client) {
    const q = client || db;
    const { recipe_id, inventory_item_id, quantity_required } = data;
    const res = await q.query(
      `INSERT INTO recipe_items (recipe_id, inventory_item_id, quantity_required) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (recipe_id, inventory_item_id) DO UPDATE SET quantity_required = EXCLUDED.quantity_required
       RETURNING *`,
      [recipe_id, inventory_item_id, quantity_required]
    );
    return res.rows[0];
  }

  async deleteRecipeItemsByRecipeId(recipeId, client) {
    const q = client || db;
    await q.query('DELETE FROM recipe_items WHERE recipe_id = $1', [recipeId]);
  }
}

module.exports = new InventoryRepository();
