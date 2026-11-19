const express = require('express');
const db = require('../db/db');
const auth = require('../middleware/auth');
const router = express.Router();

// Helper to ensure default menus exist (Menu 1..4)
const ensureDefaultMenus = async (hotelId) => {
  try {
    const existing = await db.query('SELECT * FROM hotel_menus WHERE hotel_id = $1 ORDER BY menu_number ASC', [hotelId]);
    if (existing.rows.length === 0) {
      const defaultMenus = [
        { num: 1, name: 'Menu 1' },
        { num: 2, name: 'Menu 2' },
        { num: 3, name: 'Menu 3' },
        { num: 4, name: 'Menu 4' }
      ];
      for (const m of defaultMenus) {
        try {
          await db.query('INSERT INTO hotel_menus (hotel_id, menu_number, name) VALUES ($1, $2, $3)', [hotelId, m.num, m.name]);
        } catch {
          // ignore duplicate
        }
      }
      const refreshed = await db.query('SELECT * FROM hotel_menus WHERE hotel_id = $1 ORDER BY menu_number ASC', [hotelId]);
      return refreshed.rows;
    }
    return existing.rows;
  } catch (err) {
    console.error('Error ensuring default menus:', err);
    return [
      { menu_number: 1, name: 'Menu 1' },
      { menu_number: 2, name: 'Menu 2' },
      { menu_number: 3, name: 'Menu 3' },
      { menu_number: 4, name: 'Menu 4' }
    ];
  }
};

// Get all configured menus
router.get('/menus', auth, async (req, res) => {
  try {
    const menus = await ensureDefaultMenus(req.user.hotel_id);
    res.json(menus);
  } catch (err) {
    console.error('Error fetching menus:', err);
    res.status(500).json({ message: 'Error fetching menus' });
  }
});

// Create or update a menu definition (e.g. rename or add Menu 5)
router.post('/menus', auth, async (req, res) => {
  try {
    const { menu_number, name } = req.body;
    const menuNum = parseInt(menu_number, 10);
    if (!menuNum || isNaN(menuNum)) {
      return res.status(400).json({ message: 'Valid menu number is required' });
    }
    const cleanName = (name || `Menu ${menuNum}`).trim();
    const existing = await db.query('SELECT * FROM hotel_menus WHERE hotel_id = $1 AND menu_number = $2', [req.user.hotel_id, menuNum]);
    if (existing.rows.length > 0) {
      await db.query('UPDATE hotel_menus SET name = $1 WHERE hotel_id = $2 AND menu_number = $3', [cleanName, req.user.hotel_id, menuNum]);
    } else {
      await db.query('INSERT INTO hotel_menus (hotel_id, menu_number, name) VALUES ($1, $2, $3)', [req.user.hotel_id, menuNum, cleanName]);
    }
    const menus = await db.query('SELECT * FROM hotel_menus WHERE hotel_id = $1 ORDER BY menu_number ASC', [req.user.hotel_id]);
    res.json({ success: true, menus: menus.rows });
  } catch (err) {
    console.error('Error saving menu definition:', err);
    res.status(500).json({ message: 'Error saving menu definition' });
  }
});

// Delete a menu definition
router.delete('/menus/:menu_number', auth, async (req, res) => {
  try {
    const menuNum = parseInt(req.params.menu_number, 10);
    if (!menuNum || isNaN(menuNum)) {
      return res.status(400).json({ message: 'Valid menu number is required' });
    }
    if (menuNum === 1) {
      return res.status(400).json({ message: 'Menu 1 is the default menu and cannot be deleted' });
    }

    // 1. Delete from hotel_menus
    await db.query('DELETE FROM hotel_menus WHERE hotel_id = $1 AND menu_number = $2', [req.user.hotel_id, menuNum]);

    // 2. Delete / soft-delete items and categories for this menu
    await db.query('UPDATE menu_items SET is_deleted = 1 WHERE hotel_id = $1 AND menu_number = $2', [req.user.hotel_id, menuNum]);
    await db.query('UPDATE categories SET is_deleted = 1 WHERE hotel_id = $1 AND menu_number = $2', [req.user.hotel_id, menuNum]);

    // 3. Reset any section_menus assigned to this menu back to 1
    await db.query('UPDATE section_menus SET menu_number = 1 WHERE hotel_id = $1 AND menu_number = $2', [req.user.hotel_id, menuNum]);

    // 4. Reset tables assigned to this menu back to 1
    try {
      await db.query('UPDATE tables SET menu_number = 1 WHERE hotel_id = $1 AND menu_number = $2', [req.user.hotel_id, menuNum]);
    } catch (e) {}

    // Return remaining menus
    const menus = await db.query('SELECT * FROM hotel_menus WHERE hotel_id = $1 ORDER BY menu_number ASC', [req.user.hotel_id]);
    res.json({ success: true, message: `Menu ${menuNum} deleted successfully`, menus: menus.rows });
  } catch (err) {
    console.error('Error deleting menu definition:', err);
    res.status(500).json({ message: 'Error deleting menu' });
  }
});

// Get categories
router.get('/categories', auth, async (req, res) => {
  try {
    const menuNum = parseInt(req.query.menu_number) || 1;
    const categories = await db.query(
      'SELECT * FROM categories WHERE hotel_id = $1 AND COALESCE(menu_number, 1) = $2 AND is_deleted = 0 ORDER BY name ASC',
      [req.user.hotel_id, menuNum]
    );
    res.json(categories.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error fetching categories' });
  }
});

// Create category
router.post('/categories', auth, async (req, res) => {
  const { name, marathi_name, menu_number } = req.body;
  const hotelId = req.user.hotel_id;
  const menuNum = parseInt(menu_number) || 1;
  try {
    const trimmedName = name.trim();
    const existing = await db.query(
      'SELECT * FROM categories WHERE hotel_id = $1 AND LOWER(name) = LOWER($2) AND COALESCE(menu_number, 1) = $3',
      [hotelId, trimmedName, menuNum]
    );

    if (existing.rows.length > 0) {
      const cat = existing.rows[0];
      if (cat.is_deleted === 1 || cat.is_deleted === true) {
        // Restore category
        await db.query('UPDATE categories SET is_deleted = 0, marathi_name = COALESCE($1, marathi_name) WHERE id = $2', [marathi_name || null, cat.id]);
        const restored = await db.query('SELECT * FROM categories WHERE id = $1', [cat.id]);
        return res.status(201).json(restored.rows[0]);
      }
      return res.status(200).json(cat);
    }

    const newCategory = await db.query(
      'INSERT INTO categories (hotel_id, name, marathi_name, menu_number) VALUES ($1, $2, $3, $4) RETURNING *',
      [hotelId, trimmedName, marathi_name || null, menuNum]
    );
    res.status(201).json(newCategory.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error creating category' });
  }
});

// Update category
router.put('/categories/:id', auth, async (req, res) => {
  const { name, marathi_name } = req.body;
  const { id } = req.params;
  try {
    const updated = await db.query(
      'UPDATE categories SET name = $1, marathi_name = $2 WHERE id = $3 AND hotel_id = $4 RETURNING *',
      [name, marathi_name || null, id, req.user.hotel_id]
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
    const menuNum = parseInt(req.query.menu_number) || 1;
    let queryStr = `
      SELECT mi.*, c.name as category_name, c.marathi_name as category_marathi_name
      FROM menu_items mi 
      JOIN categories c ON mi.category_id = c.id 
      WHERE mi.hotel_id = $1 AND COALESCE(mi.menu_number, 1) = $2 AND mi.is_deleted = 0
    `;
    const params = [req.user.hotel_id, menuNum];

    if (search) {
      const searchParam = `%${search.toLowerCase()}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
      queryStr += ` AND (LOWER(mi.name) LIKE $${params.length - 3} OR LOWER(mi.marathi_name) LIKE $${params.length - 2} OR LOWER(c.name) LIKE $${params.length - 1} OR CAST(mi.item_number AS TEXT) LIKE $${params.length})`;
    }

    if (category_id && category_id !== 'all') {
      params.push(parseInt(category_id));
      queryStr += ` AND mi.category_id = $${params.length}`;
    }

    // If page is not specified, return all items without pagination
    if (isNaN(page)) {
      queryStr += ` ORDER BY CASE WHEN mi.item_number IS NOT NULL AND mi.item_number > 0 THEN mi.item_number ELSE 999999 END ASC, mi.name ASC`;
      const result = await db.query(queryStr, params);
      return res.json(result.rows);
    }

    // Count query for total items
    let countQueryStr = `
      SELECT COUNT(*) AS count
      FROM menu_items mi 
      JOIN categories c ON mi.category_id = c.id 
      WHERE mi.hotel_id = $1 AND COALESCE(mi.menu_number, 1) = $2 AND mi.is_deleted = 0
    `;
    const countParams = [req.user.hotel_id, menuNum];
    if (search) {
      const searchParam = `%${search.toLowerCase()}%`;
      countParams.push(searchParam, searchParam, searchParam, searchParam);
      countQueryStr += ` AND (LOWER(mi.name) LIKE $${countParams.length - 3} OR LOWER(mi.marathi_name) LIKE $${countParams.length - 2} OR LOWER(c.name) LIKE $${countParams.length - 1} OR CAST(mi.item_number AS TEXT) LIKE $${countParams.length})`;
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
    queryStr += ` ORDER BY CASE WHEN mi.item_number IS NOT NULL AND mi.item_number > 0 THEN mi.item_number ELSE 999999 END ASC, mi.name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`;

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
  const { name, price, category_id, description, is_available, marathi_name, menu_number, item_number } = req.body;
  const hotelId = req.user.hotel_id;
  const menuNum = parseInt(menu_number) || 1;
  try {
    const lowercaseName = name.trim().toLowerCase();

    // Auto-assign item_number if not provided (MAX + 1)
    let assignedItemNumber = item_number !== undefined && item_number !== null && item_number !== '' ? parseInt(item_number, 10) : null;
    if (!assignedItemNumber || isNaN(assignedItemNumber) || assignedItemNumber <= 0) {
      const maxNumRes = await db.query(
        'SELECT COALESCE(MAX(item_number), 0) as max_num FROM menu_items WHERE hotel_id = $1 AND COALESCE(menu_number, 1) = $2 AND is_deleted = 0',
        [hotelId, menuNum]
      );
      assignedItemNumber = (parseInt(maxNumRes.rows[0]?.max_num, 10) || 0) + 1;
    }
    
    // Create the hotel-specific menu item directly
    const newItem = await db.query(
      'INSERT INTO menu_items (hotel_id, category_id, name, marathi_name, price, description, is_available, menu_number, item_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [hotelId, category_id, lowercaseName, marathi_name || null, price, description, is_available ?? true, menuNum, assignedItemNumber]
    );
    res.status(201).json(newItem.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error creating menu item' });
  }
});

// Pin / Unpin menu item handler
const handlePinToggle = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const is_pinned = body.is_pinned;

    const itemId = parseInt(id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({ message: 'Invalid item ID' });
    }

    const existing = await db.query(
      'SELECT id, is_pinned FROM menu_items WHERE id = $1',
      [itemId]
    );

    if (!existing.rows || existing.rows.length === 0) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    const currentPinned = Boolean(existing.rows[0].is_pinned);
    const targetStatus = typeof is_pinned === 'boolean' ? is_pinned : !currentPinned;
    const pinVal = targetStatus ? 1 : 0;

    await db.query(
      'UPDATE menu_items SET is_pinned = $1 WHERE id = $2',
      [pinVal, itemId]
    );

    const updated = await db.query(
      'SELECT * FROM menu_items WHERE id = $1',
      [itemId]
    );

    const rawItem = (updated.rows && updated.rows[0]) ? updated.rows[0] : {};
    const item = {
      ...rawItem,
      id: itemId,
      is_pinned: Boolean(targetStatus)
    };

    return res.json(item);
  } catch (err) {
    console.error('[PIN UPDATE ERROR]', err);
    return res.status(500).json({ message: err.message || 'Failed to update pin status' });
  }
};

router.put('/items/:id/pin', auth, handlePinToggle);
router.post('/items/:id/pin', auth, handlePinToggle);
router.patch('/items/:id/pin', auth, handlePinToggle);

// Update menu item
router.put('/items/:id', auth, async (req, res) => {
  const { name, price, category_id, description, is_available, marathi_name, item_number } = req.body;
  const { id } = req.params;
  try {
    const lowercaseName = name ? name.trim().toLowerCase() : '';
    const parsedItemNumber = item_number !== undefined && item_number !== null && item_number !== '' ? parseInt(item_number, 10) : null;
    
    const updated = await db.query(
      'UPDATE menu_items SET name = $1, marathi_name = $2, price = $3, category_id = $4, description = $5, is_available = $6, item_number = COALESCE($7, item_number) WHERE id = $8 RETURNING *',
      [lowercaseName, marathi_name || null, price, category_id, description, is_available, parsedItemNumber, id]
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
      // Soft delete to preserve history, and clear item_number so it doesn't take up numbers
      await db.query('UPDATE menu_items SET is_deleted = 1, item_number = NULL WHERE id = $1', [id]);
      return res.json({ message: 'Item removed (archived to preserve billing history)' });
    }
    res.status(500).json({ message: 'Delete failed' });
  }
});

// Swap sequence of two menu items (Left side menu list ordering)
router.put('/items/swap', auth, async (req, res) => {
  const { id1, id2 } = req.body;
  const hotelId = req.user.hotel_id;
  try {
    const r1 = await db.query('SELECT id, item_number, menu_number FROM menu_items WHERE id = $1 AND hotel_id = $2', [id1, hotelId]);
    const r2 = await db.query('SELECT id, item_number, menu_number FROM menu_items WHERE id = $2 AND hotel_id = $3', [id2, hotelId]);
    if (r1.rows.length === 0 || r2.rows.length === 0) {
      return res.status(404).json({ message: 'Menu items not found' });
    }
    let num1 = r1.rows[0].item_number;
    let num2 = r2.rows[0].item_number;

    if (num1 === num2 || num1 === null || num2 === null) {
      const menuNum = r1.rows[0].menu_number || 1;
      const allActive = await db.query(
        `SELECT id FROM menu_items WHERE hotel_id = $1 AND COALESCE(menu_number, 1) = $2 AND (is_deleted = 0 OR is_deleted IS FALSE)
         ORDER BY CASE WHEN item_number IS NOT NULL AND item_number > 0 THEN item_number ELSE 999999 END ASC, id ASC`,
        [hotelId, menuNum]
      );
      for (let i = 0; i < allActive.rows.length; i++) {
        await db.query('UPDATE menu_items SET item_number = $1 WHERE id = $2', [i + 1, allActive.rows[i].id]);
      }
      const refetch1 = await db.query('SELECT item_number FROM menu_items WHERE id = $1', [id1]);
      const refetch2 = await db.query('SELECT item_number FROM menu_items WHERE id = $2', [id2]);
      num1 = refetch1.rows[0].item_number;
      num2 = refetch2.rows[0].item_number;
    }

    await db.query('UPDATE menu_items SET item_number = $1 WHERE id = $2', [num2, id1]);
    await db.query('UPDATE menu_items SET item_number = $1 WHERE id = $2', [num1, id2]);
    notifyUpdate(hotelId, 'menu-update');
    res.json({ success: true, item1: { id: id1, item_number: num2 }, item2: { id: id2, item_number: num1 } });
  } catch (err) {
    console.error('Failed to swap menu item sequence:', err);
    res.status(500).json({ message: 'Failed to swap menu items' });
  }
});

// Contiguously renumber all active menu items 1..N
router.post('/items/renumber', auth, async (req, res) => {
  const menuNum = parseInt(req.body.menu_number) || 1;
  const hotelId = req.user.hotel_id;
  try {
    const activeItems = await db.query(
      `SELECT id, item_number FROM menu_items 
       WHERE hotel_id = $1 AND COALESCE(menu_number, 1) = $2 AND (is_deleted = 0 OR is_deleted IS FALSE)
       ORDER BY CASE WHEN item_number IS NOT NULL AND item_number > 0 THEN item_number ELSE 999999 END ASC, id ASC`,
      [hotelId, menuNum]
    );
    for (let i = 0; i < activeItems.rows.length; i++) {
      await db.query('UPDATE menu_items SET item_number = $1 WHERE id = $2', [i + 1, activeItems.rows[i].id]);
    }
    await db.query('UPDATE menu_items SET item_number = NULL WHERE hotel_id = $1 AND COALESCE(menu_number, 1) = $2 AND (is_deleted = 1 OR is_deleted IS TRUE)', [hotelId, menuNum]);
    notifyUpdate(hotelId, 'menu-update');
    res.json({ success: true, total: activeItems.rows.length });
  } catch (err) {
    console.error('Failed to renumber items:', err);
    res.status(500).json({ message: 'Failed to renumber items' });
  }
});

// Bulk import menu items
router.post('/items/bulk', auth, async (req, res) => {
  const { items, menu_number } = req.body;
  const hotelId = req.user.hotel_id;
  const menuNum = parseInt(menu_number, 10) || 1;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'No items provided' });
  }

  try {
    // 1. Get existing categories for this specific menu
    const categoriesResult = await db.query(
      'SELECT * FROM categories WHERE hotel_id = $1 AND COALESCE(menu_number, 1) = $2',
      [hotelId, menuNum]
    );
    const categoriesMap = new Map();
    categoriesResult.rows.forEach(c => {
      categoriesMap.set(c.name.toLowerCase().trim(), c);
    });

    // 2. Get existing menu items for this specific menu
    const existingItemsResult = await db.query(
      `SELECT * FROM menu_items WHERE hotel_id = $1 AND COALESCE(menu_number, 1) = $2`,
      [hotelId, menuNum]
    );
    const existingItemsMap = new Map();
    let maxItemNumber = 0;
    existingItemsResult.rows.forEach(item => {
      existingItemsMap.set(item.name.toLowerCase().trim(), item);
      if (item.item_number && Number(item.item_number) > maxItemNumber) {
        maxItemNumber = Number(item.item_number);
      }
    });

    let nextItemNumber = maxItemNumber + 1;
    let createdCount = 0;
    let updatedCount = 0;

    for (const item of items) {
      if (!item.name || !item.price || !item.category) continue;
      
      const catName = item.category.trim();
      const marathiCatName = item.marathi_category ? item.marathi_category.trim() : null;
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
        
        // Update marathi_name if provided
        if (marathiCatName && existingCat.marathi_name !== marathiCatName) {
          await db.query('UPDATE categories SET marathi_name = $1 WHERE id = $2', [marathiCatName, categoryId]);
          existingCat.marathi_name = marathiCatName;
        }
      } else {
        // Create category for this menu if it doesn't exist
        const newCat = await db.query(
          'INSERT INTO categories (hotel_id, name, marathi_name, menu_number) VALUES ($1, $2, $3, $4) RETURNING id',
          [hotelId, catName, marathiCatName, menuNum]
        );
        categoryId = newCat.rows[0].id;
        categoriesMap.set(catKey, { id: categoryId, name: catName, marathi_name: marathiCatName, is_deleted: 0, menu_number: menuNum });
      }

      const lowercaseName = item.name.trim().toLowerCase();

      if (existingItemsMap.has(lowercaseName)) {
        const existingItem = existingItemsMap.get(lowercaseName);
        const newPrice = parseFloat(item.price);
        const newMarathiName = item.marathi_name || null;
        
        const hasPriceChanged = parseFloat(existingItem.price) !== newPrice;
        const hasCategoryChanged = existingItem.category_id !== categoryId;
        const hasMarathiNameChanged = existingItem.marathi_name !== newMarathiName;
        const wasDeleted = existingItem.is_deleted === 1;

        const needsNumber = !existingItem.item_number;
        const itemNumberToSet = needsNumber ? nextItemNumber++ : existingItem.item_number;

        if (hasPriceChanged || hasCategoryChanged || hasMarathiNameChanged || wasDeleted || needsNumber) {
          await db.query(
            'UPDATE menu_items SET category_id = $1, marathi_name = $2, price = $3, description = $4, is_deleted = 0, is_available = true, item_number = $5 WHERE id = $6',
            [categoryId, newMarathiName, newPrice, item.description || existingItem.description || '', itemNumberToSet, existingItem.id]
          );
          if (needsNumber) existingItem.item_number = itemNumberToSet;
          updatedCount++;
        }
      } else {
        // Insert new item for this specific menu with sequential auto-assigned item_number
        const newMarathiName = item.marathi_name || null;
        const assignedNumber = nextItemNumber++;
        await db.query(
          'INSERT INTO menu_items (hotel_id, category_id, name, marathi_name, price, description, is_available, menu_number, item_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [hotelId, categoryId, lowercaseName, newMarathiName, parseFloat(item.price), item.description || '', true, menuNum, assignedNumber]
        );
        createdCount++;
      }
    }

    // Ensure all active items in this menu are contiguously numbered 1..N with no gaps or excessive numbers
    const activeItems = await db.query(
      `SELECT id, item_number FROM menu_items 
       WHERE hotel_id = $1 AND COALESCE(menu_number, 1) = $2 AND (is_deleted = 0 OR is_deleted IS FALSE)
       ORDER BY CASE WHEN item_number IS NOT NULL AND item_number > 0 THEN item_number ELSE 999999 END ASC, id ASC`,
      [hotelId, menuNum]
    );
    for (let i = 0; i < activeItems.rows.length; i++) {
      if (activeItems.rows[i].item_number !== i + 1) {
        await db.query('UPDATE menu_items SET item_number = $1 WHERE id = $2', [i + 1, activeItems.rows[i].id]);
      }
    }
    await db.query('UPDATE menu_items SET item_number = NULL WHERE hotel_id = $1 AND COALESCE(menu_number, 1) = $2 AND (is_deleted = 1 OR is_deleted IS TRUE)', [hotelId, menuNum]);

    res.status(201).json({ 
      message: `Successfully imported Menu ${menuNum}: ${createdCount} new items added, ${updatedCount} items updated.`, 
      createdCount, 
      updatedCount,
      menu_number: menuNum
    });
  } catch (err) {
    console.error('[BULK IMPORT ERROR]', err);
    res.status(500).json({ message: 'Server error importing items' });
  }
});

// Purge menu items and categories (supports purging a specific menu)
router.delete('/purge-all', auth, async (req, res) => {
  const hotelId = req.user.hotel_id;
  const menuNum = parseInt(req.query.menu_number || req.body?.menu_number, 10);
  try {
    if (menuNum && !isNaN(menuNum)) {
      // Purge only the specific menu
      try {
        await db.query('DELETE FROM menu_items WHERE hotel_id = $1 AND COALESCE(menu_number, 1) = $2', [hotelId, menuNum]);
      } catch {
        await db.query('UPDATE menu_items SET is_deleted = 1 WHERE hotel_id = $1 AND COALESCE(menu_number, 1) = $2', [hotelId, menuNum]);
      }
      try {
        await db.query('DELETE FROM categories WHERE hotel_id = $1 AND COALESCE(menu_number, 1) = $2', [hotelId, menuNum]);
      } catch {
        await db.query('UPDATE categories SET is_deleted = 1 WHERE hotel_id = $1 AND COALESCE(menu_number, 1) = $2', [hotelId, menuNum]);
      }
      return res.json({ message: `Menu ${menuNum} cleared successfully` });
    }

    // Purge all menus
    try {
      await db.query('DELETE FROM menu_items WHERE hotel_id = $1', [hotelId]);
    } catch {
      await db.query('UPDATE menu_items SET is_deleted = 1 WHERE hotel_id = $1', [hotelId]);
    }

    try {
      await db.query('DELETE FROM categories WHERE hotel_id = $1', [hotelId]);
    } catch {
      await db.query('UPDATE categories SET is_deleted = 1 WHERE hotel_id = $1', [hotelId]);
    }

    res.json({ message: 'All menus cleared successfully' });
  } catch (err) {
    console.error('[PURGE ALL ERROR]', err);
    res.status(500).json({ message: 'Failed to purge menu' });
  }
});

module.exports = router;
