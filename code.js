
// Get environment variables
const VISION_API_KEY = PropertiesService.getScriptProperties().getProperty('VISION_API_KEY');

function processReceiptsWithVision() {
  const inboundFolderId = '[inboundfolderID]';
  const processedFolderId = '[processedfolderID]';
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const files = DriveApp.getFolderById(inboundFolderId).getFiles();

  while (files.hasNext()) {
    const file = files.next();
    const mimeType = file.getMimeType();
    let fullText = "";

    console.log(`Processing: ${file.getName()} (${mimeType})`);

    try {
      // STRATEGY 1: Image or PDF (Use Vision API)
      if (mimeType.includes('image') || mimeType === 'application/pdf') {
        fullText = callVisionAPI(file);
      } 
      // STRATEGY 2: Plain Text or Markdown
      else if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/csv') {
        fullText = file.getBlob().getDataAsString();
      }
      // STRATEGY 3: Google Docs
      else if (mimeType === 'application/vnd.google-apps.document') {
        fullText = DocumentApp.openById(file.getId()).getBody().getText();
      }
      // STRATEGY 4: Microsoft Word (.docx)
      else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // We convert to a temp Google Doc to read text
        const tempDoc = Drive.Files.copy({title: "temp", mimeType: "application/vnd.google-apps.document"}, file.getId());
        fullText = DocumentApp.openById(tempDoc.id).getBody().getText();
        Drive.Files.remove(tempDoc.id); // Clean up
      }

      if (fullText) {
        // Extraction Logic (Shared for all file types)
        //const amountMatch = fullText.match(/\$?\s?(\d+\.\d{2})/);
        //const amount = amountMatch ? amountMatch[1] : "Check Manually";

        const amount = extractBestAmount(fullText);
        
        const dateMatch = fullText.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        
        const date = dateMatch ? dateMatch[1] : new Date();

        sheet.appendRow([date, file.getName(), amount, file.getUrl()]);
        file.moveTo(DriveApp.getFolderById(processedFolderId));
        console.log(`Successfully logged and moved ${file.getName()}`);
      } else {
        console.warn(`Could not extract text from ${file.getName()}`);
      }

    } catch (e) {
      console.error(`Error: ${e.toString()}`);
    }
  }
}

// Helper function to keep the main loop clean
function callVisionAPI(file) {
  const base64Image = Utilities.base64Encode(file.getBlob().getBytes());
  const payload = {
    requests: [{
      image: { content: base64Image },
      features: [{ type: "DOCUMENT_TEXT_DETECTION" }]
    }]
  };
  const options = {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(`https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`, options);
  const result = JSON.parse(response.getContentText());
  return (result.responses && result.responses[0].fullTextAnnotation) ? result.responses[0].fullTextAnnotation.text : null;
}

function extractBestAmount(fullText) {
  const matches = [...fullText.matchAll(/\$?\s?(\d{1,4}(?:,\d{3})*\.\d{2})/g)];

  if (!matches.length) return "Check Manually";

  const lines = fullText.split("\n").map(l => l.trim());

  let candidates = matches.map(match => {
    const value = parseFloat(match[1].replace(/,/g, ""));
    const index = match.index;

    const line = lines.find(l => l.includes(match[0])) || "";

    let score = 0;

    if (/total|amount due|balance/i.test(line)) score += 100;
    if (/subtotal/i.test(line)) score -= 40;
    if (/tax/i.test(line)) score -= 30;
    if (/tip/i.test(line)) score -= 20;

    return { value, score, line };
  });

  const maxValue = Math.max(...candidates.map(c => c.value));

  candidates = candidates.map(c => {
    if (c.value === maxValue) c.score += 25;
    return c;
  });

  candidates = candidates.map((c, i) => {
    if (i > candidates.length * 0.6) c.score += 20;
    return c;
  });

  candidates.sort((a, b) => b.score - a.score);

  return candidates[0].value.toFixed(2);
}
