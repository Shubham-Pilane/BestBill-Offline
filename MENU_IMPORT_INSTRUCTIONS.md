# BestBill POS - Menu Transcription Instructions

> **Purpose**: This file provides exact contextual instructions for the AI on how to transcribe physical hotel menu photos into a structured `.csv` file for the BestBill POS bulk import system.

When the user asks you to "extract menu photos based on the instructions file", you must strictly follow these rules:

## 1. Expected Output Format
The final output must be a valid `.csv` file with exactly three columns and the following exact header:
```csv
Category,Name,Price
```

## 2. Category Formatting
- Look for the prominent headings or boxed text in the menu photos (e.g., "व्हेज मेनकोर्स", "मटण स्पेशल").
- Transliterate or translate the category into uppercase English (e.g., "VEG MAIN COURSE", "MUTTON SPECIAL", "COLD BEVERAGES & SWEETS").
- Assign every item under that section to this category until a new heading appears.

## 3. Item Naming Rules
- **Language**: Transliterate Marathi/Hindi item names into readable English (e.g., "पनीर बटर मसाला" -> "PANEER BUTTER MASALA").
- **Casing**: Capitalize the item names fully (e.g., "CHICKEN TIKKA").
- **Full / Half Portions**: If an item lists two prices (e.g., "Full 200 / Half 100"), you must split this into **two separate rows**:
  - `Category, ITEM NAME FULL, 200`
  - `Category, ITEM NAME HALF, 100`

## 4. Pricing Rules
- Only extract the numeric value (strip out "₹" or "/-").
- If an item's price is missing or unreadable, skip the item unless you can logically infer it from a neighboring identical item.
- If an item is clearly crossed out with a marker/pen by the restaurant owner, **skip that item entirely**.

## 5. Execution Workflow
1. Read all provided images carefully.
2. Structure the data in memory.
3. Use your `write_to_file` tool to save the output as `menu_import.csv` (or similar) in the `scratch` or `artifacts` directory.
4. Reply to the user with a clickable link to download the generated `.csv` file. Do **not** dump the raw CSV text in the chat response.
