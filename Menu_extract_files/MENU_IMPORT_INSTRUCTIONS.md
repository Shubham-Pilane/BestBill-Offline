# BestBill POS - Menu Transcription Instructions

> **Purpose**: This file provides exact contextual instructions for the AI on how to transcribe physical hotel menu photos into a structured `.csv` file for the BestBill POS bulk import system.

When the user asks you to "extract menu photos based on the instructions file", you must strictly follow these rules based on what language format the user asks for:

## 1. Expected Output Format
The final output must be a valid `.csv` file. The headers and columns depend on the user's explicit request:

**Case A: User requests English only (Default)**
If the user asks for English only or doesn't specify, generate a 3-column CSV:
```csv
Category,Name,Price
```

**Case B: User requests English plus Marathi**
If the user explicitly asks for "English plus Marathi" or bilingual, generate a 5-column CSV with the original Marathi text for both the category and the item:
```csv
Category,Marathi_Category,Name,Price,Marathi_Name
```

## 2. Category Formatting
- Look for the prominent headings or boxed text in the menu photos (e.g., "व्हेज मेनकोर्स", "मटण स्पेशल").
- **English Category Column (`Category`)**: Transliterate or translate the category into uppercase English (e.g., "VEG MAIN COURSE", "MUTTON SPECIAL", "COLD BEVERAGES & SWEETS").
- **Marathi Category Column (`Marathi_Category`)**: If Case B is requested, extract the original Devanagari text for the category exactly as written (e.g., "व्हेज मेनकोर्स").
- Assign every item under that section to this category until a new heading appears.

## 3. Item Naming Rules
- **English Name Column (`Name`)**: Transliterate Marathi/Hindi item names into readable English and capitalize fully (e.g., "पनीर बटर मसाला" -> "PANEER BUTTER MASALA").
- **Marathi Name Column (`Marathi_Name`)**: If Case B is requested, extract the original Devanagari text exactly as written (e.g., "पनीर बटर मसाला").
- **Specific Spelling Rules**: NEVER use the spelling "uttapam" or "उत्तपम". ALWAYS use "UTTAPAA" in English and "उत्तपा" in Marathi.
- **Full / Half Portions**: If an item lists two prices (e.g., "Full 200 / Half 100"), you must split this into **two separate rows**:
  - `Category, [Marathi_Category if Case B], ITEM NAME FULL, 200, ओरिजिनल नाव फुल`
  - `Category, [Marathi_Category if Case B], ITEM NAME HALF, 100, ओरिजिनल नाव हाफ`

## 4. Pricing Rules
- Only extract the numeric value (strip out "₹" or "/-").
- If an item's price is missing or unreadable, skip the item unless you can logically infer it from a neighboring identical item.
- If an item is clearly crossed out with a marker/pen by the restaurant owner, **skip that item entirely**.

## 5. Execution Workflow
1. Read all provided images carefully.
2. Structure the data in memory.
3. Use your `write_to_file` tool to save the output as `menu_import.csv` (or similar) in the `scratch` or `artifacts` directory.
4. Reply to the user with a clickable link to download the generated `.csv` file. Do **not** dump the raw CSV text in the chat response.
