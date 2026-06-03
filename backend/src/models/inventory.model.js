const { DataTypes } = require('sequelize');

/**
 * Note: The backend project executes raw SQL queries directly using a custom
 * DB connector (PG-SQLite dual-driver emulator). These Sequelize definitions
 * are provided as reference and documentation schema mappings for the 
 * Inventory Management module.
 */

const defineInventoryModels = (sequelize) => {
  // 1. InventoryCategory Model
  const InventoryCategory = sequelize.define('InventoryCategory', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    hotel_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    }
  }, {
    tableName: 'inventory_categories',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  // 2. InventoryItem Model
  const InventoryItem = sequelize.define('InventoryItem', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    hotel_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    unit: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    current_stock: {
      type: DataTypes.DECIMAL(12, 4),
      defaultValue: 0.0000
    },
    minimum_stock: {
      type: DataTypes.DECIMAL(12, 4),
      defaultValue: 0.0000
    },
    purchase_rate: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    }
  }, {
    tableName: 'inventory_items',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  // 3. Supplier Model
  const Supplier = sequelize.define('Supplier', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    hotel_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    gst_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    }
  }, {
    tableName: 'suppliers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  // 4. PurchaseEntry Model
  const PurchaseEntry = sequelize.define('PurchaseEntry', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    hotel_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    supplier_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    invoice_number: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    invoice_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    total_amount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    }
  }, {
    tableName: 'purchase_entries',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  // 5. PurchaseEntryItem Model
  const PurchaseEntryItem = sequelize.define('PurchaseEntryItem', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    purchase_entry_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    inventory_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: false
    },
    rate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    }
  }, {
    tableName: 'purchase_entry_items',
    timestamps: false
  });

  // 6. StockTransaction Model
  const StockTransaction = sequelize.define('StockTransaction', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    hotel_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    inventory_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    transaction_type: {
      type: DataTypes.ENUM('PURCHASE', 'SALE', 'WASTAGE', 'ADJUSTMENT', 'RETURN'),
      allowNull: false
    },
    quantity: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: false
    },
    reference_type: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    reference_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'stock_transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  // 7. Recipe Model
  const Recipe = sequelize.define('Recipe', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    hotel_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: 'unique_recipe_hotel_product'
    }
  }, {
    tableName: 'recipes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  // 8. RecipeItem Model
  const RecipeItem = sequelize.define('RecipeItem', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    recipe_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: 'unique_recipe_item'
    },
    inventory_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: 'unique_recipe_item'
    },
    quantity_required: {
      type: DataTypes.DECIMAL(12, 4),
      allowNull: false
    }
  }, {
    tableName: 'recipe_items',
    timestamps: false
  });

  // Setup Associations
  InventoryCategory.hasMany(InventoryItem, { foreignKey: 'category_id' });
  InventoryItem.belongsTo(InventoryCategory, { foreignKey: 'category_id' });

  Supplier.hasMany(PurchaseEntry, { foreignKey: 'supplier_id' });
  PurchaseEntry.belongsTo(Supplier, { foreignKey: 'supplier_id' });

  PurchaseEntry.hasMany(PurchaseEntryItem, { foreignKey: 'purchase_entry_id' });
  PurchaseEntryItem.belongsTo(PurchaseEntry, { foreignKey: 'purchase_entry_id' });

  InventoryItem.hasMany(PurchaseEntryItem, { foreignKey: 'inventory_item_id' });
  PurchaseEntryItem.belongsTo(InventoryItem, { foreignKey: 'inventory_item_id' });

  InventoryItem.hasMany(StockTransaction, { foreignKey: 'inventory_item_id' });
  StockTransaction.belongsTo(InventoryItem, { foreignKey: 'inventory_item_id' });

  Recipe.hasMany(RecipeItem, { foreignKey: 'recipe_id' });
  RecipeItem.belongsTo(Recipe, { foreignKey: 'recipe_id' });

  InventoryItem.hasMany(RecipeItem, { foreignKey: 'inventory_item_id' });
  RecipeItem.belongsTo(InventoryItem, { foreignKey: 'inventory_item_id' });

  return {
    InventoryCategory,
    InventoryItem,
    Supplier,
    PurchaseEntry,
    PurchaseEntryItem,
    StockTransaction,
    Recipe,
    RecipeItem
  };
};

module.exports = defineInventoryModels;
