const express = require('express');
const db = require('../db/db');
const auth = require('../middleware/auth');
const router = express.Router();

// Get categories
router.get('/categories', auth, async (req, res) => {
  try {
    const categories = await db.query('SELECT * FROM categories WHERE hotel_id = $1 AND is_deleted = 0 ORDER BY name ASC', [req.user.hotel_id]);
    res.json(categories.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error fetching categories' });
  }
});

// Create category
router.post('/categories', auth, async (req, res) => {
  const { name } = req.body;
  const hotelId = req.user.hotel_id;
  try {
    const trimmedName = name.trim();
    const existing = await db.query(
      'SELECT * FROM categories WHERE hotel_id = $1 AND LOWER(name) = LOWER($2)',
      [hotelId, trimmedName]
    );

    if (existing.rows.length > 0) {
      const cat = existing.rows[0];
      if (cat.is_deleted === 1 || cat.is_deleted === true) {
        // Restore category
        await db.query('UPDATE categories SET is_deleted = 0 WHERE id = $1', [cat.id]);
        const restored = await db.query('SELECT * FROM categories WHERE id = $1', [cat.id]);
        return res.status(201).json(restored.rows[0]);
      }
      return res.status(200).json(cat);
    }

    const newCategory = await db.query(
      'INSERT INTO categories (hotel_id, name) VALUES ($1, $2) RETURNING *',
      [hotelId, trimmedName]
    );
    res.status(201).json(newCategory.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error creating category' });
  }
});

// Update category
router.put('/categories/:id', auth, async (req, res) => {
  const { name } = req.body;
  const { id } = req.params;
  try {
    const updated = await db.query(
      'UPDATE categories SET name = $1 WHERE id = $2 AND hotel_id = $3 RETURNING *',
      [name, id, req.user.hotel_id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Update failed' });
  }
});

// Delete category
router.delete('/categories/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM categories WHERE id = $1 AND hotel_id = $2', [id, req.user.hotel_id]);
    res.json({ message: 'Category deleted' });
  } catch (err) {
    if (err.message && err.message.includes('FOREIGN KEY constraint failed')) {
      // Soft delete if referenced
      await db.query('UPDATE categories SET is_deleted = 1 WHERE id = $1 AND hotel_id = $2', [id, req.user.hotel_id]);
      return res.json({ message: 'Category removed (archived to preserve billing history)' });
    }
    res.status(500).json({ message: 'Delete failed' });
  }
});

// Get menu items
router.get('/items', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const category_id = req.query.category_id || 'all';

    let queryStr = `
      SELECT mi.*, c.name as category_name 
      FROM menu_items mi 
      JOIN categories c ON mi.category_id = c.id 
      WHERE mi.hotel_id = $1 AND mi.is_deleted = 0
    `;
    const params = [req.user.hotel_id];

    if (search) {
      const searchParam = `%${search.toLowerCase()}%`;
      params.push(searchParam, searchParam);
      queryStr += ` AND (LOWER(mi.name) LIKE $${params.length - 1} OR LOWER(c.name) LIKE $${params.length})`;
    }

    if (category_id && category_id !== 'all') {
      params.push(parseInt(category_id));
      queryStr += ` AND mi.category_id = $${params.length}`;
    }

    // If page is not specified, return all items without pagination
    if (isNaN(page)) {
      queryStr += ` ORDER BY mi.name ASC`;
      const result = await db.query(queryStr, params);
      return res.json(result.rows);
    }

    // Count query for total items
    let countQueryStr = `
      SELECT COUNT(*) AS count
      FROM menu_items mi 
      JOIN categories c ON mi.category_id = c.id 
      WHERE mi.hotel_id = $1 AND mi.is_deleted = 0
    `;
    const countParams = [req.user.hotel_id];
    if (search) {
      const searchParam = `%${search.toLowerCase()}%`;
      countParams.push(searchParam, searchParam);
      countQueryStr += ` AND (LOWER(mi.name) LIKE $${countParams.length - 1} OR LOWER(c.name) LIKE $${countParams.length})`;
    }
    if (category_id && category_id !== 'all') {
      countParams.push(parseInt(category_id));
      countQueryStr += ` AND mi.category_id = $${countParams.length}`;
    }
    const countResult = await db.query(countQueryStr, countParams);
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limit);

    // Add pagination order and limit
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    queryStr += ` ORDER BY mi.name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const itemsResult = await db.query(queryStr, params);

    res.json({
      items: itemsResult.rows,
      totalPages,
      currentPage: page,
      totalItems
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching items' });
  }
});

// Create menu item
router.post('/items', auth, async (req, res) => {
  const { name, price, category_id, description, is_available } = req.body;
  const hotelId = req.user.hotel_id;
  try {
    const lowercaseName = name.trim().toLowerCase();
    
    // Create the hotel-specific menu item directly
    const newItem = await db.query(
      'INSERT INTO menu_items (hotel_id, category_id, name, price, description, is_available) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [hotelId, category_id, lowercaseName, price, description, is_available ?? true]
    );
    res.status(201).json(newItem.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error creating menu item' });
  }
});

// Update menu item
router.put('/items/:id', auth, async (req, res) => {
  const { name, price, category_id, description, is_available } = req.body;
  const { id } = req.params;
  try {
    const lowercaseName = name.trim().toLowerCase();
    
    const updated = await db.query(
      'UPDATE menu_items SET name = $1, price = $2, category_id = $3, description = $4, is_available = $5 WHERE id = $6 RETURNING *',
      [lowercaseName, price, category_id, description, is_available, id]
    );
    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Update failed' });
  }
});

// Delete menu item
router.delete('/items/:id', auth, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM menu_items WHERE id = $1', [id]);
    res.json({ message: 'Item deleted' });
  } catch (err) {
    if (err.message && err.message.includes('FOREIGN KEY constraint failed')) {
      // Soft delete to preserve history
      await db.query('UPDATE menu_items SET is_deleted = 1 WHERE id = $1', [id]);
      return res.json({ message: 'Item removed (archived to preserve billing history)' });
    }
    res.status(500).json({ message: 'Delete failed' });
  }
});

// Bulk import menu items
router.post('/items/bulk', auth, async (req, res) => {
  const { items } = req.body;
  const hotelId = req.user.hotel_id;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'No items provided' });
  }

  try {
    // 1. Get existing categories
    const categoriesResult = await db.query('SELECT * FROM categories WHERE hotel_id = $1', [hotelId]);
    const categoriesMap = new Map();
    categoriesResult.rows.forEach(c => {
      categoriesMap.set(c.name.toLowerCase().trim(), c);
    });

    // 2. Get existing menu items
    const existingItemsResult = await db.query('SELECT * FROM menu_items WHERE hotel_id = $1', [hotelId]);
    const existingItemsMap = new Map();
    existingItemsResult.rows.forEach(item => {
      existingItemsMap.set(item.name.toLowerCase().trim(), item);
    });

    let createdCount = 0;
    let updatedCount = 0;

    for (const item of items) {
      if (!item.name || !item.price || !item.category) continue;
      
      const catName = item.category.trim();
      const catKey = catName.toLowerCase();
      let categoryId;

      if (categoriesMap.has(catKey)) {
        const existingCat = categoriesMap.get(catKey);
        categoryId = existingCat.id;
        
        // If the category was soft-deleted, restore it
        if (existingCat.is_deleted === 1 || existingCat.is_deleted === true) {
          await db.query('UPDATE categories SET is_deleted = 0 WHERE id = $1', [categoryId]);
          existingCat.is_deleted = 0;
        }
      } else {
        // Create category if it doesn't exist
        const newCat = await db.query(
          'INSERT INTO categories (hotel_id, name) VALUES ($1, $2) RETURNING id',
          [hotelId, catName]
        );
        categoryId = newCat.rows[0].id;
        categoriesMap.set(catKey, { id: categoryId, name: catName, is_deleted: 0 });
      }

      const lowercaseName = item.name.trim().toLowerCase();

      if (existingItemsMap.has(lowercaseName)) {
        const existingItem = existingItemsMap.get(lowercaseName);
        const newPrice = parseFloat(item.price);
        const hasPriceChanged = parseFloat(existingItem.price) !== newPrice;
        const hasCategoryChanged = existingItem.category_id !== categoryId;
        const wasDeleted = existingItem.is_deleted === 1;

        if (hasPriceChanged || hasCategoryChanged || wasDeleted) {
          await db.query(
            'UPDATE menu_items SET category_id = $1, price = $2, description = $3, is_deleted = 0, is_available = true WHERE id = $4',
            [categoryId, newPrice, item.description || existingItem.description || '', existingItem.id]
          );
          updatedCount++;
        }
      } else {
        // Insert new item
        await db.query(
          'INSERT INTO menu_items (hotel_id, category_id, name, price, description, is_available) VALUES ($1, $2, $3, $4, $5, $6)',
          [hotelId, categoryId, lowercaseName, parseFloat(item.price), item.description || '', true]
        );
        createdCount++;
      }
    }

    res.status(201).json({ 
      message: `Successfully imported menu: ${createdCount} new items added, ${updatedCount} items updated.`, 
      createdCount, 
      updatedCount 
    });
  } catch (err) {
    console.error('[BULK IMPORT ERROR]', err);
    res.status(500).json({ message: 'Server error importing items' });
  }
});

// Purge all menu items and categories
router.delete('/purge-all', auth, async (req, res) => {
  const hotelId = req.user.hotel_id;
  try {
    // Try hard deleting menu items first
    try {
      await db.query('DELETE FROM menu_items WHERE hotel_id = $1', [hotelId]);
    } catch (err) {
      // Soft delete if referenced in active orders / bills
      await db.query('UPDATE menu_items SET is_deleted = 1 WHERE hotel_id = $1', [hotelId]);
    }

    // Try hard deleting categories first
    try {
      await db.query('DELETE FROM categories WHERE hotel_id = $1', [hotelId]);
    } catch (err) {
      // Soft delete if referenced
      await db.query('UPDATE categories SET is_deleted = 1 WHERE hotel_id = $1', [hotelId]);
    }

    res.json({ message: 'Menu and categories cleared successfully' });
  } catch (err) {
    console.error('[PURGE ALL ERROR]', err);
    res.status(500).json({ message: 'Failed to purge menu' });
  }
});

module.exports = router;
