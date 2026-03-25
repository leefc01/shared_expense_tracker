# Receipt OCR Importer (Google Apps Script)

This Google Apps Script processes receipt files from Google Drive using the Google Cloud Vision API, extracts text via OCR, infers key fields (date, vendor, category, total amount), and logs results into a Google Sheet. It also deduplicates receipts using a content hash to avoid double‑counting.

## Overview

The script:

- Reads files from a configured **inbound Drive folder**.
- Runs OCR on images and PDFs via the **Vision API**, or reads text directly for text/Docs files.
- Extracts an **amount**, **date**, **vendor**, and **category** from the recognized text.
- Writes one row per receipt into a **Receipts** sheet and logs raw OCR text into an **OCR_Log** sheet.
- Moves processed files into a **processed Drive folder** and skips duplicates using a hash of the OCR text.

## Architecture

The main entry point is `processReceiptsWithVision()`, which coordinates:

- Configuration loading from Script Properties and constants.
- Sheet creation (`Receipts`, `OCR_Log`).
- File iteration in the inbound Drive folder.
- OCR and text extraction via `callVisionAPI()` or direct reads.
- Parsing helpers:
  - `extractBestAmount(fullText)`
  - `extractDate(text)`
  - `extractVendor(text)`
  - `classifyCategory(text, vendor)`
- Deduplication: `generateHash(text)` and `getExistingHashes(sheet)`.
- Logging through a small logger with log levels.

## Prerequisites

- Google account with access to:
  - Google Drive
  - Google Sheets
  - Google Apps Script
- A **Google Cloud project** with the **Vision API** enabled.
- A **Vision API key** created for that project.

## Configuration

The script reads configuration from `Script Properties` and local constants:

```javascript
const SCRIPT_PROPS = PropertiesService.getScriptProperties();

const CONFIG = {
  VISION_API_KEY: SCRIPT_PROPS.getProperty('VISION_API_KEY'),
  INBOUND_FOLDER_ID: SCRIPT_PROPS.getProperty('INBOUND_FOLDER_ID'),
  PROCESSED_FOLDER_ID: SCRIPT_PROPS.getProperty('PROCESSED_FOLDER_ID'),
  LOG_LEVEL: SCRIPT_PROPS.getProperty('LOG_LEVEL') || "INFO",
  SHEET_NAME: "Receipts",
  LOG_SHEET: "OCR_Log"
};
```

### Required Script Properties

Set these in the Apps Script UI:

1. Open the script editor: `Extensions` → `Apps Script`.
2. Go to `Project Settings` → `Script properties` (or `Project properties` → `Script properties`).
3. Add:

- `VISION_API_KEY` – Your Google Cloud Vision API key.
- `INBOUND_FOLDER_ID` – The Drive folder ID where new receipts will be dropped.
- `PROCESSED_FOLDER_ID` – The Drive folder ID where processed receipts will be moved.
- `LOG_LEVEL` – Optional, one of `DEBUG`, `INFO`, `WARN`, `ERROR`. Defaults to `INFO`.

### Sheets

By default the script uses:

- `Receipts` – main data sheet.
- `OCR_Log` – log sheet for raw OCR text.

You can change their names by editing `CONFIG.SHEET_NAME` and `CONFIG.LOG_SHEET`.

## Sheet Layout

The script ensures both sheets exist and contains header rows by calling `getOrCreateSheet(name, headers)`.

### Receipts sheet

`CONFIG.SHEET_NAME` (default: `Receipts`) is created with headers:

1. `Date`
2. `File Name`
3. `Vendor`
4. `Category`
5. `Amount`
6. `Confidence`
7. `File URL`
8. `Hash`

Each processed receipt appends one row in this order.

### OCR_Log sheet

`CONFIG.LOG_SHEET` (default: `OCR_Log`) is created with headers:

1. `Timestamp`
2. `File Name`
3. `Raw Text`

The script logs a (truncated) copy of the OCR output for each processed file.

## Main Workflow

### Entry point: `processReceiptsWithVision()`

Steps:

1. Log start message using `log("INFO", ...)`.
2. Get or create the `Receipts` and `OCR_Log` sheets.
3. Get `inboundFolder` and `processedFolder` by ID from `CONFIG`.
4. Load existing hashes from the `Receipts` sheet via `getExistingHashes(sheet)` to detect duplicates.
5. Iterate all files in `inboundFolder`:
   - Log file name.
   - Extract text content using `extractTextFromFile(file)`.
   - If no text is found, log a warning and continue to next file.
   - Generate an MD5 hash of the text with `generateHash(fullText)`.
   - If hash already exists in `existingHashes`, treat as **duplicate**:
     - Log a warning.
     - Move file to `processedFolder`.
     - Continue to next file.
   - Otherwise:
     - Extract amount and confidence: `extractBestAmount(fullText)`.
     - Extract date: `extractDate(fullText)`.
     - Extract vendor: `extractVendor(fullText)`.
     - Classify category: `classifyCategory(fullText, vendor)`.
     - Append a row to the `Receipts` sheet with `[date, fileName, vendor, category, amount, confidence, fileUrl, hash]`.
     - Append a row to `OCR_Log` with `[timestamp, fileName, truncatedFullText]`.
     - Move file to `processedFolder`.
     - Log completion with amount and confidence.
6. Log completion message.

### Logging

Logging is controlled by `CONFIG.LOG_LEVEL` and `LOG_LEVELS`:

```javascript
const LOG_LEVELS = { DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 };

function log(level, message) {
  if (LOG_LEVELS[level] >= LOG_LEVELS[CONFIG.LOG_LEVEL]) {
    console.log(`[${level}] ${message}`);
  }
}
```

- Messages below the configured level are suppressed.
- Logs go to the Apps Script execution log.

## Text Extraction Logic

### `extractTextFromFile(file)`

Determines how to read text based on MIME type:

- Image (`mimeType` contains `image`) or `application/pdf`:
  - Calls `callVisionAPI(file)` for OCR.
- Text files (`mimeType` contains `text`):
  - Reads text directly from `file.getBlob().getDataAsString()`.
- Google Docs (`mimeType` includes `google-apps.document`):
  - Opens with `DocumentApp.openById(file.getId())` and reads `getBody().getText()`.
- Any other type:
  - Returns `null`.

### `callVisionAPI(file)`

1. Base64 encodes the file bytes:

   ```javascript
   const base64Image = Utilities.base64Encode(file.getBlob().getBytes());
   ```

2. Sends a POST request to:

   `https://vision.googleapis.com/v1/images:annotate?key=<VISION_API_KEY>`

   with payload:

   ```json
   {
     "requests": [{
       "image": { "content": "<base64Image>" },
       "features": [{ "type": "DOCUMENT_TEXT_DETECTION" }]
     }]
   }
   ```

3. If response code is not 200, throws `"Vision API failure"`.
4. Parses the JSON and returns:

   ```javascript
   result?.responses?.?.fullTextAnnotation?.text || null;
   ```

## Amount Extraction

### `extractBestAmount(fullText)`

Goal: infer the **most likely total amount** on the receipt and assign a heuristic confidence score.

1. Uses regex to find monetary amounts:

   ```javascript
   const matches = [...fullText.matchAll(/\$?\s?(\d{1,4}(?:,\d{3})*\.\d{2})/g)];
   ```

   - Captures values like `10.99`, `1,234.56`, `9999.99` (with optional `$`).

2. If no matches:
   - Returns `{ amount: "Check Manually", confidence: 0 }`.

3. Splits the text into lines using `\n`.

4. For each match:
   - Parses numeric value.
   - Finds the line containing the match.
   - Assigns a base **score**:
     - +100 if line includes `total|amount due|balance|grand total` (case‑insensitive).
     - −40 if `subtotal`.
     - −30 if `tax`.
     - −20 if `tip`.

5. Determines the maximum value across candidates.
6. Applies additional heuristics:
   - If a candidate’s value equals the max, `score += 25` (favor larger amounts).
   - If its index is in the later 40% of candidates, `score += 20` (favor amounts near bottom of receipt).

7. Sorts candidates by descending score and picks the first as `best`.
8. Returns:

   ```javascript
   {
     amount: best.value.toFixed(2),
     confidence: Math.min(100, best.score)
   }
   ```

Confidence is a heuristic score capped at 100.

## Deduplication

### `generateHash(text)`

- Computes an MD5 digest of the entire OCR text:

  ```javascript
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    text
  );
  ```

- Converts bytes to a hex string:

  ```javascript
  return raw.map(b => (b + 256).toString(16).slice(-2)).join('');
  ```

This hash is stored in the `Hash` column of the `Receipts` sheet and used to identify duplicates.

### `getExistingHashes(sheet)`

- Reads all values from the sheet via `sheet.getDataRange().getValues()`.
- Starting from row index 1 (skipping header row), adds the value in column index 7 (zero‑based) to a `Set`.
- Returns the `Set` of known hashes.

## Other Extraction Helpers

### `extractDate(text)`

- Uses regex:

  ```javascript
  const match = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  ```

- Returns the matched date string (e.g., `1/5/2026`), or `new Date()` if no match is found.

**Note:** The fallback `new Date()` is a JavaScript `Date` object, which Apps Script will write to Sheets as a date/time value.

### `extractVendor(text)`

- Splits text into trimmed lines:

  ```javascript
  const lines = text.split("\n").map(l => l.trim());
  ```

- Looks at the first 5 lines and returns the first line that:
  - Is non‑empty.
  - Does not match `receipt|invoice|total` (case‑insensitive).

- If nothing suitable is found, returns `"Unknown Vendor"`.

This assumes that the vendor name is likely near the top of the receipt and does not contain generic words.

### `classifyCategory(text, vendor)`

- Combines `text` and `vendor`, lowercases the result:

  ```javascript
  const combined = (text + vendor).toLowerCase();
  ```

- Applies simple keyword checks:

  - If `/utility|electric|water|gas/` → `"Utilities"`.
  - If `/landscap|lawn/` → `"Landscaping"`.
  - If `/repair|maintenance|plumb|hvac/` → `"Maintenance"`.
  - If `/clean/` → `"Cleaning"`.
  - If `/insurance/` → `"Insurance"`.
  - Else → `"Other"`.

This provides a rough category classification that you can extend.

## Sheet Helper

### `getOrCreateSheet(name, headers)`

- Gets the active spreadsheet: `SpreadsheetApp.getActiveSpreadsheet()`.
- Attempts to get sheet `name` with `getSheetByName`.
- If it doesn’t exist, inserts a new sheet with that name.
- If the sheet has no rows (`getLastRow() === 0`), appends the `headers` row.
- Returns the sheet.

## Permissions & Deployment

When you first run `processReceiptsWithVision()`:

- You will be prompted to grant permissions to:
  - View and manage spreadsheets in your Google Drive.
  - View and manage Google Drive files.
  - Connect to an external service (Vision API via `UrlFetchApp`).

### Typical usage

1. Create two Drive folders:
   - One for inbound receipts.
   - One for processed receipts.
2. Copy their IDs and set `INBOUND_FOLDER_ID` and `PROCESSED_FOLDER_ID` in Script Properties.
3. Ensure your Google Sheet is open and bound to this script.
4. Run `processReceiptsWithVision()` from the Apps Script editor, or:
   - Create a custom menu or time‑based trigger to run it periodically.

### Example trigger

To run hourly:

- In Apps Script, go to `Triggers` → `Add Trigger`.
- Choose `processReceiptsWithVision` as the function.
- Select a time‑driven trigger (e.g., every hour).

## Extending and Maintaining

When modifying or extending the script:

- Keep the **column order** in `Receipts` consistent or update `getExistingHashes` if you move the hash column.
- If you change date or amount extraction logic, test on a variety of receipts (different formats, currencies, layouts).
- If you add new categories, extend `classifyCategory` with additional regex patterns.
- To improve vendor detection, you can:
  - Add a known vendors list and fuzzy matching.
  - Skip lines that contain only numeric strings or addresses.

Add comments near regexes and heuristics if you tune them, so future maintainers understand the rationale.
