# Unified Bilingual Menu Architecture & Advanced Printing Engine

## 1. Core Objectives
Currently, the application treats English and Marathi as two separate menus, leading to duplicate items and a strict separation of printing logic. 
This migration will unify the database so that **every single menu item has both an English name and an optional Marathi name attached to it**. 

This completely solves the phonetic search issue (waiters can search in English to find Marathi items) and allows decoupled printing (KOT in Marathi, Final Bill in English).

## 2. The 3 Application Modes
Based on the user's `App Language` selection in Profile Settings, the app will behave in one of three ways:

### Mode 1: English Only
*   **Menu UI:** Shows only English names.
*   **Dashboard UI:** Shows only English names. Search works in English.
*   **Print Settings:** KOT & Bill language dropdowns are disabled. Both forced to print in English.

### Mode 2: Marathi Only
*   **Menu UI:** Shows **English + Marathi** names (allowing managers to edit both).
*   **Dashboard UI:** Shows **ONLY Marathi names**. Search works perfectly using *both* English phonetic typing and Marathi typing.
*   **Print Settings:** KOT & Bill language dropdowns are disabled. Both forced to print in Marathi.

### Mode 3: Hinglish (Smart Hybrid)
*   **Menu UI:** Shows **English + Marathi** names.
*   **Dashboard UI:** Shows **English + Marathi** names together on the button (e.g. `Nutella Bun / नुटेला बन`). Search works in both.
*   **Print Settings:** **Unlocked.** The owner can independently select the KOT Print Language and the Final Bill Print Language. (e.g. KOT = Marathi, Bill = English).

---

## 3. Execution Plan (Step-by-Step)
When instructed to "Execute the plan", the AI should follow these exact steps sequentially:

### Step 1: Database Upgrades & Migration Script
1. Add `marathi_name` column (`VARCHAR(255) NULL`) to the `menu_items` table.
2. Add new user settings columns to the `users` table:
   *   `app_language` (ENUM: 'en', 'mr', 'hinglish')
   *   `print_lang_kot` (ENUM: 'en', 'mr')
   *   `print_lang_bill` (ENUM: 'en', 'mr')
3. Create a one-time migration script that drops the old `lang` logic and cleans up the table.

### Step 2: Backend API Updates (`backend/src/routes/menu.js`)
1. **GET /items:** Remove old `lang` filters. Fetch all items with `name` and `marathi_name`.
2. **POST /items & PUT /items/:id:** Update to accept and save `marathi_name`.
3. **CSV Upload:** Update the CSV parser to read a new "Marathi Name" column and save it directly to the single item row.
4. **Settings API:** Update Profile API to fetch/save the 3 new language and printer settings.

### Step 3: Profile Settings UI (`frontend/src/pages/Settings.jsx` or Profile equivalent)
1. Add a dropdown for **App Language** (English, Marathi, Hinglish).
2. Add a section for **Printer Languages**:
   *   KOT Print Language (Dropdown: English/Marathi)
   *   Final Bill Print Language (Dropdown: English/Marathi)
3. Write logic so Printer Languages are disabled (greyed out) *unless* App Language is set to Hinglish.

### Step 4: Menu Management UI (`frontend/src/pages/MenuManagement.jsx`)
1. Remove the "English / Marathi" toggle tabs completely.
2. Update the item list grid to display the `marathi_name` alongside the English name.
3. Update the "Add/Edit Item" modal to include a text input field for "Marathi Name".
4. Update the "Download Sample CSV" to include the "Marathi Name" column header.

### Step 5: Dashboard & Search UI (`OrderModal.jsx`, `RoomOrderModal.jsx`, `MobileOrderModal.jsx`)
1. **Search Logic:** Update the `searchQuery` filter to check `item.name.toLowerCase().includes()` **OR** `item.marathi_name.includes()`.
2. **Button Display Logic:** Render the text inside the item button dynamically:
   *   If App Lang == 'en': `{item.name}`
   *   If App Lang == 'mr': `{item.marathi_name || item.name}`
   *   If App Lang == 'hinglish': `{item.name} {item.marathi_name ? '/ ' + item.marathi_name : ''}`

### Step 6: Core Print Engine (`backend/src/services/printFormatter.js`)
1. Read the user's specific print settings (`print_lang_kot` and `print_lang_bill`) from the request context or database.
2. When building the **KOT Buffer**: Iterate over items. If `print_lang_kot` is 'mr', replace the print text with `item.marathi_name || item.name`.
3. When building the **Final Bill Buffer**: Iterate over items. If `print_lang_bill` is 'mr', replace the print text with `item.marathi_name || item.name`.
4. Ensure the Devanagari canvas renderer is triggered correctly if the substituted name contains Devanagari characters.
