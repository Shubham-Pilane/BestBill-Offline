const db = require('../db/db');
const inventoryRepository = require('../repositories/inventoryRepository');

class InventoryService {
  // --- UNIT CONVERSION UTILITIES ---
  getUnitFactor(unit) {
    const u = String(unit).toLowerCase().trim();
    if (u === 'kg' || u === 'kilogram' || u === 'kilograms') {
      return { factor: 1000, baseUnit: 'Gram' };
    }
    if (u === 'litre' || u === 'l' || u === 'litres') {
      return { factor: 1000, baseUnit: 'ML' };
    }
    if (u === 'gram' || u === 'grams' || u === 'gm' || u === 'g') {
      return { factor: 1, baseUnit: 'Gram' };
    }
    if (u === 'ml' || u === 'millilitre' || u === 'millilitres') {
      return { factor: 1, baseUnit: 'ML' };
    }
    return { factor: 1, baseUnit: unit }; // Piece, Packet, Bottle, etc.
  }

  toBaseUnit(quantity, unit) {
    const { factor } = this.getUnitFactor(unit);
    return Number(quantity) * factor;
  }

  fromBaseUnit(quantity, unit) {
    const { factor } = this.getUnitFactor(unit);
    return Number(quantity) / factor;
  }

  // --- ATOMIC BILL DEDUCTION ENGINE ---
  async deductStockForOrder(orderId, hotelId, client) {
    const q = client || db;

    // 1. Fetch hotel settings to check if negative stock is allowed
    const hotelRes = await q.query('SELECT allow_negative_stock FROM hotels WHERE id = $1', [hotelId]);
    const allowNegative = hotelRes.rows[0]?.allow_negative_stock === 1 || hotelRes.rows[0]?.allow_negative_stock === true;

    // 2. Fetch all sold items in this order
    const orderItemsRes = await q.query(
      `SELECT oi.quantity, oi.menu_item_id, mi.name as product_name
       FROM order_items oi
       JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    const ingredientRequirements = {};

    // 3. Accumulate total ingredient requirements across all items
    for (const item of orderItemsRes.rows) {
      // Fetch recipe
      const recipe = await inventoryRepository.getRecipeByProductId(hotelId, item.menu_item_id, q);
      if (!recipe) continue; // No recipe mapping exists for this item

      for (const recipeItem of recipe.items) {
        const itemId = recipeItem.inventory_item_id;
        const requiredQty = Number(recipeItem.quantity_required) * Number(item.quantity);

        if (!ingredientRequirements[itemId]) {
          // Fetch the database record for current stock check
          const dbItem = await inventoryRepository.getItemById(hotelId, itemId, q);
          ingredientRequirements[itemId] = {
            itemId,
            name: dbItem.name,
            unit: dbItem.unit,
            required: 0,
            current_stock: Number(dbItem.current_stock || 0)
          };
        }
        ingredientRequirements[itemId].required += requiredQty;
      }
    }

    // 4. Validate stock if negative stock is NOT allowed
    if (!allowNegative) {
      for (const itemId in ingredientRequirements) {
        const req = ingredientRequirements[itemId];
        if (req.current_stock < req.required) {
          const reqDisplay = this.fromBaseUnit(req.required, req.unit);
          const availDisplay = this.fromBaseUnit(req.current_stock, req.unit);
          throw new Error(
            `Insufficient stock for ingredient: ${req.name}. ` +
            `Required: ${reqDisplay.toFixed(2)} ${req.unit}, ` +
            `Available: ${availDisplay.toFixed(2)} ${req.unit}.`
          );
        }
      }
    }

    // 5. Update stock values and insert ledger transactions
    for (const itemId in ingredientRequirements) {
      const req = ingredientRequirements[itemId];
      await inventoryRepository.updateStock(hotelId, itemId, -req.required, q);
      await inventoryRepository.createTransaction(
        hotelId,
        {
          inventory_item_id: itemId,
          transaction_type: 'SALE',
          quantity: -req.required,
          reference_type: 'orders',
          reference_id: orderId,
          remarks: `Sale consumption for Order #${orderId}`
        },
        q
      );
    }
  }

  // --- PURCHASE ENTRY SERVICE ---
  async savePurchaseEntry(hotelId, data) {
    const { supplier_id, invoice_number, invoice_date, items } = data;
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Calculate total amount
      let totalAmount = 0;
      const parsedItems = items.map(item => {
        const amt = Number(item.quantity) * Number(item.rate);
        totalAmount += amt;
        return { ...item, amount: amt };
      });

      // 1. Create Purchase Entry
      const entry = await inventoryRepository.createPurchaseEntry(
        hotelId,
        { supplier_id, invoice_number, invoice_date, total_amount: totalAmount },
        client
      );

      // 2. Add items, update stock, write transaction ledger
      for (const item of parsedItems) {
        // Fetch item to verify unit type
        const dbItem = await inventoryRepository.getItemById(hotelId, item.inventory_item_id, client);
        if (!dbItem) {
          throw new Error(`Inventory item #${item.inventory_item_id} not found.`);
        }

        // Convert quantity to base unit
        const baseQty = this.toBaseUnit(item.quantity, dbItem.unit);

        // Insert Purchase Item
        await inventoryRepository.createPurchaseEntryItem(
          {
            purchase_entry_id: entry.id,
            inventory_item_id: item.inventory_item_id,
            quantity: baseQty, // stored in base units
            rate: item.rate,
            amount: item.amount
          },
          client
        );

        // Update Stock
        await inventoryRepository.updateStock(hotelId, item.inventory_item_id, baseQty, client);

        // Log Stock Transaction
        await inventoryRepository.createTransaction(
          hotelId,
          {
            inventory_item_id: item.inventory_item_id,
            transaction_type: 'PURCHASE',
            quantity: baseQty,
            reference_type: 'purchase_entries',
            reference_id: entry.id,
            remarks: `Purchase invoice #${invoice_number}`
          },
          client
        );
      }

      await client.query('COMMIT');
      return entry;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // --- STOCK ADJUSTMENT ---
  async saveStockAdjustment(hotelId, data) {
    const { inventory_item_id, physical_stock, remarks } = data;
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const dbItem = await inventoryRepository.getItemById(hotelId, inventory_item_id, client);
      if (!dbItem) {
        throw new Error('Inventory item not found.');
      }

      // Convert physical stock to base unit
      const physicalBase = this.toBaseUnit(physical_stock, dbItem.unit);
      const currentBase = Number(dbItem.current_stock || 0);
      const diff = physicalBase - currentBase;

      // Update Stock (add difference)
      await inventoryRepository.updateStock(hotelId, inventory_item_id, diff, client);

      // Log Stock Transaction
      await inventoryRepository.createTransaction(
        hotelId,
        {
          inventory_item_id,
          transaction_type: 'ADJUSTMENT',
          quantity: diff,
          reference_type: 'adjustments',
          reference_id: null,
          remarks: remarks || `Physical stock audit adjustment. System: ${this.fromBaseUnit(currentBase, dbItem.unit)} ${dbItem.unit}, Physical: ${physical_stock} ${dbItem.unit}`
        },
        client
      );

      await client.query('COMMIT');
      return { success: true, difference: diff };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // --- WASTAGE ENTRY ---
  async saveWastage(hotelId, data) {
    const { inventory_item_id, quantity, reason } = data;
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const dbItem = await inventoryRepository.getItemById(hotelId, inventory_item_id, client);
      if (!dbItem) {
        throw new Error('Inventory item not found.');
      }

      const wastageBase = this.toBaseUnit(quantity, dbItem.unit);

      // Fetch allow_negative_stock settings
      const hotelRes = await client.query('SELECT allow_negative_stock FROM hotels WHERE id = $1', [hotelId]);
      const allowNegative = hotelRes.rows[0]?.allow_negative_stock === 1 || hotelRes.rows[0]?.allow_negative_stock === true;

      // Validate wastage limits
      if (!allowNegative && Number(dbItem.current_stock || 0) < wastageBase) {
        throw new Error(`Cannot waste more than available stock. Available: ${this.fromBaseUnit(dbItem.current_stock, dbItem.unit)} ${dbItem.unit}`);
      }

      // Update Stock
      await inventoryRepository.updateStock(hotelId, inventory_item_id, -wastageBase, client);

      // Log Stock Transaction
      await inventoryRepository.createTransaction(
        hotelId,
        {
          inventory_item_id,
          transaction_type: 'WASTAGE',
          quantity: -wastageBase,
          reference_type: 'wastage',
          reference_id: null,
          remarks: reason || 'Spoiled / Burnt / Expired product'
        },
        client
      );

      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // --- DASHBOARD ANALYTICS ---
  async getDashboardData(hotelId) {
    // 1. Total items
    const totalItemsRes = await db.query('SELECT COUNT(*) as count FROM inventory_items WHERE hotel_id = $1', [hotelId]);
    
    // 2. Low stock count
    const lowStockRes = await db.query(
      'SELECT COUNT(*) as count FROM inventory_items WHERE hotel_id = $1 AND current_stock <= minimum_stock AND current_stock > 0',
      [hotelId]
    );

    // 3. Out of stock count
    const outOfStockRes = await db.query(
      'SELECT COUNT(*) as count FROM inventory_items WHERE hotel_id = $1 AND current_stock <= 0',
      [hotelId]
    );

    // 4. Today's consumption (Sum of sales quantities in base units - value is negative in transactions)
    const consumptionRes = await db.query(
      `SELECT COALESCE(SUM(ABS(quantity)), 0) as total 
       FROM stock_transactions 
       WHERE hotel_id = $1 
         AND transaction_type = 'SALE' 
         AND date(created_at, 'localtime') = date('now', 'localtime')`,
      [hotelId]
    );

    // 5. Today's purchases
    const purchasesRes = await db.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total 
       FROM purchase_entries 
       WHERE hotel_id = $1 
         AND date(invoice_date) = date('now', 'localtime')`,
      [hotelId]
    );

    // 6. Inventory value (Current Stock * purchase_rate in display units)
    // Formula: (current_stock / unit_multiplier) * purchase_rate
    const items = await inventoryRepository.getItems(hotelId);
    let totalValuation = 0;
    for (const item of items) {
      const displayStock = this.fromBaseUnit(item.current_stock, item.unit);
      totalValuation += displayStock * Number(item.purchase_rate || 0);
    }

    return {
      totalItems: Number(totalItemsRes.rows[0]?.count || 0),
      lowStockItems: Number(lowStockRes.rows[0]?.count || 0),
      outOfStockItems: Number(outOfStockRes.rows[0]?.count || 0),
      todayConsumption: Number(consumptionRes.rows[0]?.total || 0), // raw sum of base units
      todayPurchases: Number(purchasesRes.rows[0]?.total || 0),
      inventoryValue: Number(totalValuation.toFixed(2))
    };
  }

  // --- SAVE RECIPE WITH INGREDIENTS ---
  async saveRecipe(hotelId, data) {
    const { product_id, items } = data; // items: [{ inventory_item_id, quantity_required }]
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Create or update recipe
      const recipe = await inventoryRepository.createRecipe(hotelId, product_id, client);
      
      // Clear existing recipe items
      await inventoryRepository.deleteRecipeItemsByRecipeId(recipe.id, client);

      // Create new recipe items (stored in base units)
      for (const ingredient of items) {
        const dbItem = await inventoryRepository.getItemById(hotelId, ingredient.inventory_item_id, client);
        if (!dbItem) throw new Error(`Inventory item #${ingredient.inventory_item_id} not found.`);

        // Convert the required qty to base unit
        const baseQty = this.toBaseUnit(ingredient.quantity_required, dbItem.unit);

        await inventoryRepository.createRecipeItem(
          {
            recipe_id: recipe.id,
            inventory_item_id: ingredient.inventory_item_id,
            quantity_required: baseQty
          },
          client
        );
      }

      await client.query('COMMIT');
      return recipe;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new InventoryService();
