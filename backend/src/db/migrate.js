const db = require('./db');
const bcrypt = require('bcryptjs');

const syncSchema = async () => {
    console.log('[MIGRATION] Starting database synchronization...');
    
    try {
        // 1. Ensure core tables exist (Idempotent)
        const coreTables = [
            `CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'owner',
                hotel_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS hotels (
                id SERIAL PRIMARY KEY,
                owner_id INTEGER REFERENCES users(id),
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(20),
                location TEXT,
                logo_url TEXT,
                upi_id VARCHAR(255),
                subscription_amount DECIMAL(10,2) DEFAULT 0,
                subscription_valid_until TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS master_menu (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                category_name VARCHAR(100),
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                hotel_id INTEGER REFERENCES hotels(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_deleted BOOLEAN DEFAULT false
            )`,
            `CREATE TABLE IF NOT EXISTS menu_items (
                id SERIAL PRIMARY KEY,
                hotel_id INTEGER REFERENCES hotels(id) ON DELETE CASCADE,
                master_id INTEGER REFERENCES master_menu(id) ON DELETE SET NULL,
                category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                description TEXT,
                is_available BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_deleted BOOLEAN DEFAULT false
            )`,
            `CREATE TABLE IF NOT EXISTS rooms (
                id SERIAL PRIMARY KEY, 
                hotel_id integer REFERENCES hotels(id) ON DELETE CASCADE, 
                room_number character varying(50) NOT NULL, 
                room_name character varying(255), 
                floor character varying(50) DEFAULT 'Floor 1', 
                status character varying(50) DEFAULT 'available', 
                created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP, 
                UNIQUE (hotel_id, room_number)
            )`,
            `CREATE TABLE IF NOT EXISTS tables (
                id SERIAL PRIMARY KEY,
                hotel_id INTEGER REFERENCES hotels(id),
                table_number VARCHAR(50) NOT NULL,
                capacity INTEGER DEFAULT 4,
                status VARCHAR(20) DEFAULT 'available',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (hotel_id, table_number)
            )`,
            `CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                table_id INTEGER REFERENCES tables(id) ON DELETE CASCADE,
                room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS bills (
                id SERIAL PRIMARY KEY,
                order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
                total_amount DECIMAL(10,2) DEFAULT 0,
                gst DECIMAL(10,2) DEFAULT 0,
                final_amount DECIMAL(10,2) DEFAULT 0,
                discount_percentage DECIMAL(5,2) DEFAULT 0,
                is_paid BOOLEAN DEFAULT false,
                payment_method VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
                menu_item_id INTEGER REFERENCES menu_items(id),
                quantity INTEGER NOT NULL,
                printed_quantity INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (order_id, menu_item_id)
            )`,
            `CREATE TABLE IF NOT EXISTS order_chats (
                id SERIAL PRIMARY KEY,
                order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
                sender VARCHAR(20) NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS subscription_history (
                id SERIAL PRIMARY KEY,
                hotel_id INTEGER REFERENCES hotels(id) ON DELETE CASCADE,
                amount DECIMAL(10,2) NOT NULL,
                months_added INTEGER NOT NULL,
                valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                valid_until TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const query of coreTables) {
            await db.query(query);
        }

        // 2. Performance Indexes (Non-blocking)
        const indexQueries = [
            'CREATE INDEX IF NOT EXISTS idx_categories_hotel_id ON categories(hotel_id)',
            'CREATE INDEX IF NOT EXISTS idx_menu_items_hotel_id ON menu_items(hotel_id)',
            'CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON menu_items(category_id)',
            'CREATE INDEX IF NOT EXISTS idx_tables_hotel_id ON tables(hotel_id)',
            'CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id)',
            'CREATE INDEX IF NOT EXISTS idx_bills_order_id ON bills(order_id)',
            'CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)',
            'CREATE INDEX IF NOT EXISTS idx_subscription_history_hotel_id ON subscription_history(hotel_id)'
        ];

        for (const query of indexQueries) {
            try {
                await db.query(query);
            } catch (e) {
                console.warn(`[MIGRATION] Index skip: ${e.message}`);
            }
        }

        // 3. Schema Evolution (Column Checks)
        const migrations = [
            "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS printed_quantity INTEGER DEFAULT 0",
            "WITH duplicates AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY order_id, menu_item_id ORDER BY created_at) as rn FROM order_items) DELETE FROM order_items WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)",
            "ALTER TABLE order_items ADD CONSTRAINT unique_order_item UNIQUE (order_id, menu_item_id)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'owner'",
            "ALTER TABLE hotels ADD COLUMN IF NOT EXISTS gst_percentage DECIMAL(5,2) DEFAULT 5",
            "ALTER TABLE hotels ADD COLUMN IF NOT EXISTS is_service_stopped BOOLEAN DEFAULT false",
            "ALTER TABLE hotels ADD COLUMN IF NOT EXISTS printer_size VARCHAR(10) DEFAULT '80mm'",
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS floor VARCHAR(50) DEFAULT 'Floor 1'",
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE",
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS owner_message TEXT",
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_note TEXT",
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_delivered BOOLEAN DEFAULT false",
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'admin'",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS guest_name VARCHAR(255)",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS guest_phone VARCHAR(20)",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS booking_days INTEGER",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS total_cost DECIMAL(10,2)",
            "ALTER TABLE rooms ADD COLUMN IF NOT EXISTS check_in_date TIMESTAMP",
            "ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)",
            "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS hotel_id INTEGER REFERENCES hotels(id) ON DELETE CASCADE",
            "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS master_id INTEGER REFERENCES master_menu(id) ON DELETE SET NULL",
            "ALTER TABLE hotels ADD COLUMN IF NOT EXISTS billing_method VARCHAR(20) DEFAULT 'qz'",
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_prepared BOOLEAN DEFAULT false",
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiter_name VARCHAR(100)",
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS kot_sent_at TIMESTAMP",
            "ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false",
            "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false",
            
            // 4. Critical Unique Indexes (for ON CONFLICT logic)
            "CREATE UNIQUE INDEX IF NOT EXISTS unique_active_table_order ON orders (table_id) WHERE status = 'active' AND table_id IS NOT NULL",
            "CREATE UNIQUE INDEX IF NOT EXISTS unique_active_room_order ON orders (room_id) WHERE status = 'active' AND room_id IS NOT NULL",
            "ALTER TABLE tables ADD CONSTRAINT tables_hotel_id_table_number_key UNIQUE (hotel_id, table_number)"
        ];

        for (const q of migrations) {
            try {
                await db.query(q);
            } catch (e) {
                // Ignore errors like "column already exists"
            }
        }

        console.log('[MIGRATION] Database schema is up to date.');
    } catch (err) {
        console.error('[MIGRATION] Schema sync failed:', err.message);
    }
};

module.exports = { syncSchema };
