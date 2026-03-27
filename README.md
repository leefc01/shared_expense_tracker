# Shared Expense Tracker

A Google Apps Script tool for HOAs, small organizations, and teams that automatically reads receipts and invoices from Google Drive, extracts key information, and logs everything to a Google Sheet. No server, no backend, no monthly fees — it runs entirely inside your Google account.

---

## Table of contents

- [How it works](#how-it-works)
- [What gets captured](#what-gets-captured)
- [Architecture overview](#architecture-overview)
- [File reference](#file-reference)
- [Prerequisites](#prerequisites)
- [Deployment: simple path (no API key required)](#deployment-simple-path-no-api-key-required)
- [Deployment: Vision API path (better OCR accuracy)](#deployment-vision-api-path-better-ocr-accuracy)
- [Script properties reference](#script-properties-reference)
- [Supported file types](#supported-file-types)
- [Recommended Drive folder structure](#recommended-drive-folder-structure)
- [Human corrections and ML training](#human-corrections-and-ml-training)
- [Extending the code](#extending-the-code)
- [Future enhancements](#future-enhancements)
- [Security note aka Gemini's Sneak Diss](#security-note)

---

## How it works

1. You drop receipt or invoice files into an **Inbound** folder in Google Drive.
2. Run `processReceipts()` from the Apps Script editor (or set up a time-based trigger to run it automatically).
3. Each file is read using OCR, parsed for date, vendor, amount, description, and category, then logged as a row in a Google Sheet.
4. The original file is moved to a **Processed** folder.
5. A second sheet (`OCR_Log`) stores the raw extracted text for auditing.

Duplicate files are detected automatically via a hash of the OCR text and skipped without re-processing.

---

## What gets captured

### Receipts sheet

| Column | Description |
|--------|-------------|
| Date | Transaction date extracted from the receipt. Blank if no date was found (see confidence score). |
| File Name | Original filename in Google Drive |
| Vendor | Vendor name, taken from the top of the document. Skips lines that look like email addresses or phone numbers. |
| Description | Description of service or item |
| Category | Expense category assigned by keyword matching (see `category_classifier.js`) |
| Amount | Total transaction amount, selected using keyword scoring heuristics |
| Confidence | Score from 0–100 indicating parser confidence. Penalized when date is missing or amount keywords are absent. |
| Uploader | Google Drive owner of the file |
| File URL | Direct link to the original file in Drive |
| Hash | MD5 hash of the OCR text, used for deduplication |
| Human Correction | Field for reviewer corrections. Used to build ML training data — see [Human corrections and ML training](#human-corrections-and-ml-training). |

### OCR_Log sheet

| Column | Description |
|--------|-------------|
| File Name | File that was processed |
| OCR Text | Full raw text extracted by OCR |
| Logged At | Timestamp of processing |

---

## Architecture overview

```
+------------------+
|     main.js      |  processReceipts() — entry point
+------------------+
         |
         v
+----------------------+
|  DocumentProcessor   |  orchestrates OCR + parsing + post-processing
+----------------------+
         |                          |
         v                          v
+------------------+     +--------------------+
|   OCRService     |     |   ParserFactory    |  selects parser based on PROCESSOR_MODE
+------------------+     +--------------------+
    |         |                     |
    v         v                     v
+-------+ +----------+    +-------------------+
| Drive | | Vision   |    |   VisionParser    |  rule-based extraction
|  OCR  | | Service  |    | (parser_rule_     |
+-------+ +----------+    |  based.js)        |
                          +-------------------+
         |
         v
+------------------+
|   SheetService   |  writes to Receipts and OCR_Log sheets
+------------------+
```

- `OCR_MODE = DRIVE` uses Google Drive's built-in OCR (free, no setup).
- `OCR_MODE = VISION` uses the Google Cloud Vision API (better accuracy on photos and low-quality scans, requires an API key).
- `PROCESSOR_MODE = OCR_RULE` is the current active mode. `DOCUMENT_AI` is stubbed for future use.

---

## File reference

### `main.js`
Entry point. Call `processReceipts()` to start a run.

| Function | Description |
|----------|-------------|
| `processReceipts()` | Iterates inbound Drive files, orchestrates processing, deduplication, sheet writes, and file moves |

---

### `document_processor.js`
Orchestrates a single file through OCR, parsing, and post-processing. Returns a structured receipt object or `null` if extraction fails.

| Function | Description |
|----------|-------------|
| `DocumentProcessor.process(file)` | Selects parser via `ParserFactory`, runs OCR, parses text, assigns hash, category, filename, and URL |

---

### `parser_factory.js`
Returns the correct parser instance based on `PROCESSOR_MODE`. Add new parser implementations here.

| Function | Description |
|----------|-------------|
| `ParserFactory.getParser()` | Returns `VisionParser` for `OCR_RULE` mode. Throws a clear error for unknown or unimplemented modes. |

---

### `parser_rule_based.js`
Rule-based parser that extracts structured fields from raw OCR text using keyword heuristics and regex.

| Function | Description |
|----------|-------------|
| `VisionParser.parseFromText(text, file)` | Main parse entry point. Returns a receipt object with all fields.| `VisionParser.extractAmount(text)` | Scores all dollar amounts in the text and returns the most likely total |
| `VisionParser.extractDate(text)` | Searches for date keywords first, then falls back to any date pattern. Returns blank string if not found. |
| `VisionParser.extractVendor(text)` | Returns the first non-email, non-phone line from the top of the document |
| `VisionParser.extractDescription(text)` | Finds lines matching description keywords and strips the label |
| `VisionParser.calculateConfidence(text, date)` | Scores 0–100 based on presence of amount keywords. Applies a 20-point penalty if no date was found. |

---

### `ocr_service.js`
Routes files to the appropriate OCR backend based on file type and `OCR_MODE`.

| Function | Description |
|----------|-------------|
| `OCRService.extractText(file)` | Dispatches to Drive OCR, Vision API, or native text reading based on MIME type |
| `OCRService.extractWithDrive(file)` | Copies the file as a Google Doc, extracts body text, then always deletes the temp doc (even if extraction fails) |
| `OCRService.extractWithVision(file)` | Delegates to `VisionService` |

---

### `vision_service.js`
Calls the Google Cloud Vision API for OCR. Only used when `OCR_MODE = VISION`.

| Function | Description |
|----------|-------------|
| `VisionService.extractText(file)` | Base64-encodes the file and sends it to the Vision `DOCUMENT_TEXT_DETECTION` endpoint. Checks both top-level and per-image errors. |

---

### `sheet_service.js`
All Google Sheets interactions.

| Function | Description |
|----------|-------------|
| `SheetService.getReceiptsSheet()` | Returns (or creates) the Receipts sheet, adding a header row if empty |
| `SheetService.getLogSheet()` | Returns (or creates) the OCR_Log sheet |
| `SheetService.appendReceipt(sheet, receipt)` | Appends a parsed receipt as a new row |
| `SheetService.logOCR(sheet, fileName, ocrText)` | Appends a raw OCR entry to the log sheet |
| `SheetService.getExistingHashes(sheet)` | Returns a `Set` of all hash values already in the sheet, for deduplication |

---

### `drive_service.js`
Handles Drive folder access. Throws a descriptive error if required folder ID properties are not set.

| Function | Description |
|----------|-------------|
| `DriveService.getInboundFiles()` | Returns a file iterator for the inbound folder |
| `DriveService.getProcessedFolder()` | Returns the processed folder object |

---

### `category_classifier.js`
Classifies an expense into a category by matching keywords in the OCR text and vendor name.

| Function | Description |
|----------|-------------|
| `CategoryClassifier.classify(text, vendor)` | Returns a category string: Utilities, Landscaping, Maintenance, Cleaning, Insurance, or Other |

To add new categories, add a new `if` block with your keywords before the `return "Other"` line.

---

### `logger_service.js`
Lightweight logging with optional Sheet output. Log level and sheet logging are controlled via Script Properties.

| Function | Description |
|----------|-------------|
| `LoggerService.info(msg)` | Logs at INFO level (shown when `LOGGER_LEVEL >= 3`) |
| `LoggerService.warn(msg)` | Logs at WARN level (shown when `LOGGER_LEVEL >= 2`) |
| `LoggerService.error(msg)` | Logs at ERROR level (shown when `LOGGER_LEVEL >= 1`) |

---

### `utils.js`

| Function | Description |
|----------|-------------|
| `Utils.generateHash(text)` | Returns an MD5 hex string of the input. Used to fingerprint OCR text for deduplication. |

---

### `app_defaults.js`
Central configuration constants. If you want to change sheet names, default modes, keywords, or confidence settings without touching Script Properties, edit this file.

---

## Prerequisites

- A **Google account** (personal Gmail works; Google Workspace is not required).  See [Security note aka Gemini's Sneak Diss](#security-note)
- A **Google Sheet** where receipts will be logged — create a blank one before deploying
- Two **Google Drive folders**: one for inbound files, one for processed files
- The **folder IDs** for both (copy from the URL when you open a folder in Drive: `https://drive.google.com/drive/folders/THIS_PART`)

For the Vision API path only:
- A **Google Cloud project** with the Cloud Vision API enabled
- An **API key** with access to the Vision API

---

## Deployment: simple path (no API key required)

This path uses Google Drive's built-in OCR. It works well for clean PDFs and Google Docs. For blurry photos or low-quality scans, see the Vision API path below.

**Step 1 — Create a Google Sheet**

1. Create or open the Google Sheet for your tracker.
2. Click **Extensions** > **Apps Script**. This opens a separate Apps Script project bound to that sheet.

**Step 2 — Copy the script files into Apps Script**

1. Continuing Step 1 (You can also go to [script.google.com](https://script.google.com))
2. Delete the default `Code.gs` file.
3. For each `.js` file in this repository, click **+** > **Script** and paste in the file contents. Name the script file to match (e.g. `main`, `document_processor`, etc.).
4. Click **Save**.

> The simplest setup is to open your Google Sheet and go to **Extensions > Apps Script**. This creates a project that is automatically linked to your sheet — no additional configuration needed to connect to it.

**Step 3 — Set Script Properties**

1. In the Apps Script editor, click **Project Settings** (gear icon) > **Script Properties**.
2. Add the following properties:

| Property | Value |
|----------|-------|
| `INBOUND_FOLDER_ID` | ID of your inbound Drive folder |
| `PROCESSED_FOLDER_ID` | ID of your processed Drive folder |
| `OCR_MODE` | `DRIVE` |
| `PROCESSOR_MODE` | `OCR_RULE` |
| `ML_MODE` | `OFF` |

**Step 4 — Authorize the script**

1. In the Apps Script editor, select `processReceipts` from the function dropdown and click **Run**.
2. Google will ask you to authorize the script. Click **Review permissions** and grant access to Drive and Sheets.

**Step 5 — Run it**

1. Drop one or more receipt files into your inbound folder.
2. Click **Run** in the Apps Script editor with `processReceipts` selected.
3. Open your Google Sheet — you should see new rows in the `Receipts` tab and raw OCR text in `OCR_Log`.

**Optional: run automatically on a schedule**

1. Click **Triggers** (clock icon) in the left sidebar.
2. Click **+ Add Trigger**.
3. Set function to `processReceipts`, event source to **Time-driven**, and choose your interval (e.g. daily).

> ⚠️ Temporary Google Docs are created during Drive OCR and deleted automatically after text is extracted. If a run is interrupted, you may occasionally find orphaned docs named `temp_ocr_...` in your Drive root — these can be deleted manually.

---

## Deployment: Vision API path (better OCR accuracy)

Use this path when you need better results on photos of receipts, handwritten notes, or low-quality scans. Complete all steps from the simple path first, then continue here.

**Step 1 — Create a Google Cloud project**

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Click **Select a project** > **New Project**. Give it a name and click **Create**.

**Step 2 — Enable the Vision API**

1. In the Cloud Console, go to **APIs & Services** > **Library**.
2. Search for **Cloud Vision API** and click **Enable**.

**Step 3 — Create an API key**

1. Go to **APIs & Services** > **Credentials**.
2. Click **+ Create Credentials** > **API key**.
3. Copy the key. Optionally click **Restrict key** and limit it to the Cloud Vision API to reduce risk if the key is ever exposed.

> ⚠️ Do not paste your API key into the script files or commit it to source control. Always store it in Script Properties.

**Step 4 — Add the key to Script Properties**

In the Apps Script editor, go to **Project Settings** > **Script Properties** and add or update:

| Property | Value |
|----------|-------|
| `VISION_API_KEY` | Your API key from step 3 |
| `OCR_MODE` | `VISION` |

All other properties remain the same as the simple path.

The script will use Vision API for images and PDFs, and automatically fall back to Drive OCR if Vision returns no result.

---

## Script properties reference

| Property | Required | Default | Description |
|----------|----------|---------|-------------|
| `INBOUND_FOLDER_ID` | Yes | — | Google Drive folder ID for inbound files |
| `PROCESSED_FOLDER_ID` | Yes | — | Google Drive folder ID for processed files |
| `OCR_MODE` (optional)| No | `VISION` | `DRIVE` for Drive OCR (free, no API key), `VISION` for Vision API |
| `PROCESSOR_MODE` (optional)| No | `OCR_RULE` | `OCR_RULE` is the only active mode. `DOCUMENT_AI` is reserved for future use. |
| `ML_MODE` (optional)| No | `OFF` | Reserved for future ML-assisted parsing |
| `VISION_API_KEY` (optional)| Only if `OCR_MODE=VISION` | — | Google Cloud Vision API key |
| `LOGGER_LEVEL` (optional)| No | `3` | `1` = errors only, `2` = warnings + errors, `3` = all |
| `LOGGER_SHEET_ENABLED` (optional)| No | `OFF` | Set to `ON` to write log entries to the OCR_Log sheet |

---

## Supported file types

| Type | Drive OCR | Vision API |
|------|-----------|------------|
| PDF | Yes | Yes |
| JPEG / PNG | Yes | Yes |
| Google Docs | Yes (native) | No |
| Microsoft Word (.docx) | Yes | No |
| Plain text / CSV / Markdown | Yes (direct read) | No |

---

## Recommended Drive folder structure

```
/Shared Expense Tracker
├── Inbound Receipts        ← upload files here before running
│   ├── HOA_Invoice_01.pdf
│   ├── Vendor_Receipt_2026-03-15.jpg
│   └── ...
└── Processed Receipts      ← files are moved here automatically after processing
```

You can name these folders anything you like — what matters is that you copy the correct folder IDs into your Script Properties.

---

## Human corrections and ML training

The **Human Correction** column in the Receipts sheet serves two purposes: fixing individual rows that the parser got wrong, and building a labeled dataset for future ML improvements.

### How to fill it in

Use `key:value` pairs, one per line. Only include fields that were wrong — leave the column blank if the row looks correct.

```
date:2026-03-15
vendor:Pacific Gas & Electric
amount:142.50
category:Utilities
```

Valid keys: `date`, `vendor`, `description`, `amount`, `category`, `reject`

**Examples:**

The vendor was parsed incorrectly:
```
vendor:Acme Landscaping Co.
```

The amount and category were both wrong:
```
amount:89.00
category:Maintenance
```

The OCR quality was too poor to produce any reliable data — exclude this row from training entirely:
```
reject:true
```

The row was parsed correctly — leave the Human Correction column blank.

### Why this format

A plain `YES/NO` flag tells you a row is wrong but loses the ground truth — you'd have nothing useful to train on. Free text is readable but can't be parsed reliably by a script. The `key:value` format is easy enough for a non-technical reviewer to fill in and structured enough to be read programmatically into training examples.

### Exporting training data

A future export script will read the sheet and produce labeled examples structured like this:

```json
{
  "input": "(raw OCR text from the OCR_Log sheet)",
  "output": {
    "date": "2026-03-15",
    "vendor": "Pacific Gas & Electric",
    "amount": 142.50,
    "category": "Utilities"
  },
  "label": "corrected"
}
```

The export logic:
- Start with the parser's original output for the row
- Overlay any corrections from the Human Correction column
- Mark corrected rows as `"label": "corrected"`, untouched high-confidence rows as `"label": "clean"`
- Skip rows where `reject:true` is set

Over time, corrected rows from real receipts in your organization become domain-specific labeled data — exactly what makes fine-tuning a model worthwhile for your specific use case.

### Recommended review workflow

1. After each processing run, filter the Receipts sheet to rows where **Confidence** is below 70.
2. Open the original file using the File URL column and compare it to what was extracted.
3. Fill in the Human Correction column for any fields that are wrong.
4. Add `reject:true` for rows where OCR failed entirely.

You do not need to correct every row. A small number of high-quality corrections on low-confidence rows is more useful for training than trying to review everything.

---

## Extending the code

**Add a new expense category**

Open `category_classifier.js` and add a new `if` block before `return "Other"`:

```js
if (/plumbing|pipe|drain/.test(t)) return "Plumbing";
```

**Add a new parser**

1. Create a new file (e.g. `parser_document_ai.js`) that exports an object with a `parseFromText(text, file)` method returning the same receipt object shape as `VisionParser`.
2. Add a new `case` to `parser_factory.js` that returns your new parser.
3. Set `PROCESSOR_MODE` in Script Properties to your new mode name.

**Change the sheet column layout**

Edit the header row in `SheetService.getReceiptsSheet()` and the `appendReceipt()` function in `sheet_service.js`. Keep the column order consistent between both places.

**Enable sheet-level logging**

Set `LOGGER_SHEET_ENABLED = ON` in Script Properties. Log entries will be appended as rows to the `OCR_Log` sheet in addition to the Apps Script console.

---

## Future enhancements

- ML-assisted parsing for vendor and description fields using collected human corrections
- Export script for generating structured ML training datasets from the Receipts sheet
- Integration with Google Document AI (`DOCUMENT_AI` processor mode)
- Customizable confidence thresholds per field
- Multi-language receipt support


---

## Security note

It is highly recommended to create a new google account to run this script.  The script needs access only to the spreadsheet where it executes, the folders it handles, and a temporary file it creates.  However, Google's security model wants the ID which executes the script to have access to all of your documents on your Google Drive.

Snippets from Google Gemini when asked about limiting script access.

> **How to Make the Permission Less "Scary"**
>
> If you don't like the script having access to "All your Google Sheets," you can restrict it to only the spreadsheet you are currently in.

Later, when limiting the permissions to just the active file didn't work.

> That error is appearing because the @OnlyCurrentDoc tag we added earlier is doing its job too well. It tells Google to only grant access to the specific spreadsheet the script is attached to, which explicitly blocks the script from opening other files like Google Docs or Word files by their ID
>
> To answer your first question: Yes, that scope is essentially a "master key" for every Google Doc you have access to. It is not limited to the files in your specific folder.
> 
> To your second question: Unfortunately, **Google Apps Script does not offer a "Folder-only" OAuth scope.** The Google security model is generally designed around "Services" (All Drive, All Docs, All Sheets) rather than "Location" (This Folder only). This is a common point of frustration for developers looking to follow the "Principle of Least Privilege."
>
> **How to Handle Security with 3+ Users**
>
> Since you are working in a Shared Drive with a small group, here is the standard "Best Practice" for this scenario:
>
> - **Trust the Code, Not the Scope:** The script technically has the authority to see all files, but it only has the instructions to look at your specific inboundFolderId. As long as you (the developer) don't write code that deletes your whole Drive, the "master key" stays safely in the drawer.
>
> - **Use a Dedicated "Bot" Account (Optional):** If you are very concerned about security, some teams create a dummy Google Account (e.g., receipt-bot@yourdomain.com). You give that bot account "Contributor" access only to the specific Shared Drive folders. You then "own" and run the script from that account. That way, even with a broad "All Files" scope, the script's reach is physically limited to what that bot account can see.
>
> - **Internal Visibility:** Since this script is only shared with 3 specific people and not published to the web, the "Unverified App" warning you saw earlier is actually your primary security layer. It ensures no one outside your group can accidentally authorize the script.

I went with the separate bot account, despite Gemini's sneak diss.
