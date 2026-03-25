# Shared Expense Tracker

## Overview

This project is a **Google Apps Script-based shared expense tracker** designed for **HOAs, small organizations, or teams** to automate processing receipts and invoices. It parses uploaded files from Google Drive, extracts structured information, and logs it in Google Sheets for tracking and auditing.

The system supports:

- OCR-based text extraction using **Google Vision API** or **Google Drive OCR** (no API key required)
- Rule-based parsing of receipts for:
  - Date of transaction
  - Vendor
  - Description of service/item
  - Amount
  - Category (via classification)
  - Confidence scoring
  - Uploader
  - File URL
  - Deduplication hash
  - Human correction column
- Logging of raw OCR text in a separate sheet for auditing
- Extensible architecture for future ML or Document AI integration

---

## Features & Columns in Google Sheet

The main `Receipts` sheet includes:

| Column | Description |
|--------|-------------|
| Date | Transaction date, extracted using keyword heuristics (e.g., "Transaction Date", "Service Date") |
| File Name | Original file name in Google Drive |
| Vendor | Vendor name (top-of-document heuristics, deprioritizes emails/phones) |
| Description | Description of service or item, cleaned of redundant labels |
| Category | Categorized expense (from CategoryClassifier or future ML) |
| Amount | Total transaction amount, determined with scoring heuristics |
| Confidence | Confidence score (0-100) based on heuristics |
| Uploader | Drive file owner |
| File URL | Link to the original file in Google Drive |
| Hash | Unique hash for deduplication |
| Human Correction | Column for manual override / corrections |

The `OCR_Log` sheet captures:

| Column | Description |
|--------|-------------|
| File Name | File being processed |
| OCR Text | Full extracted text |
| Logged At | Timestamp of logging |

---

## Architecture Overview

    +-------------------+
    | DocumentProcessor  | <-- orchestrates processing
    +-------------------+
              |
              v
    +-------------------+         +----------------+
    |    OCRService     | ---->   | VisionService  |
    | (Drive OCR / Vision)|       | (Vision API)   |
    +-------------------+         +----------------+
              |
              v
    +-------------------+
    |  VisionParser      | <-- rule-based parser
    +-------------------+
              |
              v
    +-------------------+
    |  SheetService      | <-- logs data to Sheets
    +-------------------+

- **Processor Mode**: Configurable via `PROCESSOR_MODE` property (`OCR_RULE` or future `DOCUMENT_AI`)  
- **ML Mode**: Toggle `ML_MODE` (currently placeholder, future ML-assisted parsing)  
- **OCR Mode**: Toggle `OCR_MODE` (`VISION` or `DRIVE`) to control which OCR backend is used  

---

## Script Properties Setup Example

Set these in **Apps Script > Project Settings > Script Properties**:

| Property | Example Value | Description |
|----------|---------------|-------------|
| `VISION_API_KEY` | `AIzaSy...` | Required if using Vision API OCR |
| `PROCESSOR_MODE` | `OCR_RULE` | `"OCR_RULE"` or `"DOCUMENT_AI"` (future) |
| `ML_MODE` | `OFF` | `"ON"` or `"OFF"` (future ML parsing) |
| `OCR_MODE` | `VISION` | `"VISION"` for Vision API or `"DRIVE"` for Google Drive OCR |

> ⚠️ Note: Vision API is optional. Use `OCR_MODE = DRIVE` to minimize setup and avoid API keys.

---
## Recommended Folder Structure

Organize your Google Drive for smooth processing:

    /Shared Expense Tracker
    ├── Inbound Receipts/Invoices  <-- place files here for processing
    │   ├── HOA_Invoice_01.pdf
    │   ├── Vendor_Receipt_2026-03-20.jpg
    │   └── ...
    ├── Processed Receipts/Invoices  <-- files are moved here after processing
    └── Logs (optional)              <-- if you want to keep a separate folder of exported logs

### Notes:

- **Inbound folder**: All files you want to process must be uploaded here. Supported file types:
  - PDF
  - Images (JPEG, PNG)
  - Google Docs
  - Microsoft Word (.docx)
  - CSV, Plain Text, Markdown
- **Processed folder**: Files are automatically moved here after successful processing.
- **Folder IDs** must match your Script Properties or be hard-coded in `DriveService`.

> ⚠️ Ensure the Apps Script has **access to these folders** with at least Viewer+ permissions. Otherwise, file moves and OCR may fail.
## Perquisites

1. **Google Workspace Account** with access to Drive and Sheets
2. **Vision API (optional)**
   - If using Vision OCR, set `VISION_API_KEY` in Script Properties
3. **Inbound Drive Folder** with receipt files
4. **Google Sheet** where receipts will be logged

---

## Deployment Instructions

1. Open the project in **Google Apps Script**
2. Set **Script Properties** as shown in the table above
3. Link to your **Google Sheets** where receipts will be logged
4. Place inbound files in the designated Drive folder
5. Run `processReceipts()` to start processing
6. Check the `Receipts` and `OCR_Log` sheets for results

> ⚠️ **Note:** Temporary Google Docs are created when using Drive OCR. They are automatically deleted after extraction.

---

## Future Enhancements

- ML-assisted parsing for vendor/description classification
- Integration with **Google Document AI** (DOCUMENT_API mode)
- Automated categorization using predefined rules or ML
- Customizable confidence scoring thresholds
- Multi-language receipt support

---

## Coding & Maintainability Notes

- **Typed pipeline with JSDoc** ensures maintainability and autocomplete
- **Deduplication** via hash prevents double-processing
- **Uploader info** captured for audit and accountability
- **Human correction column** allows manual override without losing original OCR
- **Modular services** (`OCRService`, `VisionService`, `DocumentProcessor`, `SheetService`) make it easy to swap or extend OCR backends or parsing logic
