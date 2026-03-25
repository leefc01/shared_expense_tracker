// ================= CONFIG =================
const SCRIPT_PROPS = PropertiesService.getScriptProperties();

const CONFIG = {
  VISION_API_KEY: SCRIPT_PROPS.getProperty('VISION_API_KEY'),
  INBOUND_FOLDER_ID: SCRIPT_PROPS.getProperty('INBOUND_FOLDER_ID'),
  PROCESSED_FOLDER_ID: SCRIPT_PROPS.getProperty('PROCESSED_FOLDER_ID'),
  LOG_LEVEL: SCRIPT_PROPS.getProperty('LOG_LEVEL') || "INFO",
  SHEET_NAME: "Receipts",
  LOG_SHEET: "OCR_Log"
};

// ================= LOGGER =================
const LOG_LEVELS = { DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 };

function log(level, message) {
  if (LOG_LEVELS[level] >= LOG_LEVELS[CONFIG.LOG_LEVEL]) {
    console.log(`[${level}] ${message}`);
  }
}

// ================= MAIN =================
function processReceiptsWithVision() {
  log("INFO", "Starting receipt processing");

  const sheet = getOrCreateSheet(CONFIG.SHEET_NAME, [
    "Date", "File Name", "Vendor", "Category", "Amount", "Confidence", "File URL", "Hash"
  ]);

  const logSheet = getOrCreateSheet(CONFIG.LOG_SHEET, [
    "Timestamp", "File Name", "Raw Text"
  ]);

  const inboundFolder = DriveApp.getFolderById(CONFIG.INBOUND_FOLDER_ID);
  const processedFolder = DriveApp.getFolderById(CONFIG.PROCESSED_FOLDER_ID);
  const files = inboundFolder.getFiles();

  const existingHashes = getExistingHashes(sheet);

  while (files.hasNext()) {
    const file = files.next();

    log("INFO", `Processing: ${file.getName()}`);

    try {
      const fullText = extractTextFromFile(file);

      if (!fullText) {
        log("WARN", `No text: ${file.getName()}`);
        continue;
      }

      const hash = generateHash(fullText);

      if (existingHashes.has(hash)) {
        log("WARN", `Duplicate detected: ${file.getName()}`);
        file.moveTo(processedFolder);
        continue;
      }

      const { amount, confidence } = extractBestAmount(fullText);
      const date = extractDate(fullText);
      const vendor = extractVendor(fullText);
      const category = classifyCategory(fullText, vendor);

      sheet.appendRow([
        date,
        file.getName(),
        vendor,
        category,
        amount,
        confidence,
        file.getUrl(),
        hash
      ]);

      logSheet.appendRow([
        new Date(),
        file.getName(),
        fullText.substring(0, 50000) // prevent overflow
      ]);

      file.moveTo(processedFolder);

      log("INFO", `Completed: ${file.getName()} | $${amount} (${confidence})`);

    } catch (e) {
      log("ERROR", `Error processing ${file.getName()}: ${e}`);
    }
  }

  log("INFO", "Processing complete");
}

// ================= TEXT EXTRACTION =================
function extractTextFromFile(file) {
  const mimeType = file.getMimeType();

  log("DEBUG", `Extracting text from ${mimeType}`);

  if (mimeType.includes('image') || mimeType === 'application/pdf') {
    return callVisionAPI(file);
  }

  if (mimeType.includes('text')) {
    return file.getBlob().getDataAsString();
  }

  if (mimeType.includes('google-apps.document')) {
    return DocumentApp.openById(file.getId()).getBody().getText();
  }

  return null;
}

// ================= VISION =================
function callVisionAPI(file) {
  log("DEBUG", "Calling Vision API");

  const base64Image = Utilities.base64Encode(file.getBlob().getBytes());

  const response = UrlFetchApp.fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${CONFIG.VISION_API_KEY}`,
    {
      method: "POST",
      contentType: "application/json",
      payload: JSON.stringify({
        requests: [{
          image: { content: base64Image },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }]
        }]
      }),
      muteHttpExceptions: true
    }
  );

  if (response.getResponseCode() !== 200) {
    throw new Error("Vision API failure");
  }

  const result = JSON.parse(response.getContentText());

  return result?.responses?.[0]?.fullTextAnnotation?.text || null;
}

// ================= AMOUNT =================
function extractBestAmount(fullText) {
  const matches = [...fullText.matchAll(/\$?\s?(\d{1,4}(?:,\d{3})*\.\d{2})/g)];
  if (!matches.length) return { amount: "Check Manually", confidence: 0 };

  const lines = fullText.split("\n");

  let candidates = matches.map(match => {
    const value = parseFloat(match[1].replace(/,/g, ""));
    const line = lines.find(l => l.includes(match[0])) || "";

    let score = 0;

    if (/total|amount due|balance|grand total/i.test(line)) score += 100;
    if (/subtotal/i.test(line)) score -= 40;
    if (/tax/i.test(line)) score -= 30;
    if (/tip/i.test(line)) score -= 20;

    return { value, score };
  });

  const maxValue = Math.max(...candidates.map(c => c.value));

  candidates = candidates.map((c, i) => {
    if (c.value === maxValue) c.score += 25;
    if (i > candidates.length * 0.6) c.score += 20;
    return c;
  });

  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];

  return {
    amount: best.value.toFixed(2),
    confidence: Math.min(100, best.score)
  };
}

// ================= HASH =================
function generateHash(text) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    text
  );

  return raw.map(b => (b + 256).toString(16).slice(-2)).join('');
}

function getExistingHashes(sheet) {
  const values = sheet.getDataRange().getValues();
  const hashes = new Set();

  for (let i = 1; i < values.length; i++) {
    hashes.add(values[i][7]); // hash column
  }

  return hashes;
}

// ================= OTHER HELPERS =================
function extractDate(text) {
  const match = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  return match ? match[1] : new Date();
}

function extractVendor(text) {
  const lines = text.split("\n").map(l => l.trim());

  for (let i = 0; i < 5; i++) {
    if (lines[i] && !/receipt|invoice|total/i.test(lines[i])) {
      return lines[i];
    }
  }

  return "Unknown Vendor";
}

function classifyCategory(text, vendor) {
  const combined = (text + vendor).toLowerCase();

  if (/utility|electric|water|gas/.test(combined)) return "Utilities";
  if (/landscap|lawn/.test(combined)) return "Landscaping";
  if (/repair|maintenance|plumb|hvac/.test(combined)) return "Maintenance";
  if (/clean/.test(combined)) return "Cleaning";
  if (/insurance/.test(combined)) return "Insurance";

  return "Other";
}

// ================= SHEET =================
function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);

  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  return sheet;
}
