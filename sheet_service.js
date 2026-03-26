/**
 * SheetService
 * Handles all Google Sheets interactions for receipts and logs.
 */
const SheetService = (function() {

  function getReceiptsSheet() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APP_DEFAULTS.SHEET_NAME)
      || SpreadsheetApp.getActiveSpreadsheet().insertSheet(APP_DEFAULTS.SHEET_NAME);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Date","File Name","Vendor","Description","Category","Amount",
        "Confidence","Uploader","File URL","Hash","Human Correction"
      ]);
    }
    return sheet;
  }

  function getLogSheet() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(APP_DEFAULTS.LOG_SHEET)
      || SpreadsheetApp.getActiveSpreadsheet().insertSheet(APP_DEFAULTS.LOG_SHEET);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["File Name","OCR Text","Logged At"]);
    }
    return sheet;
  }

  function appendReceipt(sheet, receipt) {
    sheet.appendRow([
      receipt.date, receipt.fileName, receipt.vendor, receipt.description,
      receipt.category, receipt.amount, receipt.confidence, receipt.uploader,
      receipt.url, receipt.hash, receipt.humanCorrection || ""
    ]);
  }

  function logOCR(sheet, fileName, ocrText) {
    sheet.appendRow([fileName, ocrText, new Date()]);
  }

  // Bug 1 fix: getLastRow() returns 1 when only the header row exists, making
  // getLastRow()-1 = 0, which causes getRange() to throw. Guard against this.
  function getExistingHashes(sheet) {
    if (sheet.getLastRow() <= 1) return new Set();
    const data = sheet.getRange(2, 10, sheet.getLastRow() - 1).getValues();
    return new Set(data.flat().filter(Boolean));
  }

  return { getReceiptsSheet, getLogSheet, appendReceipt, logOCR, getExistingHashes };

})();
