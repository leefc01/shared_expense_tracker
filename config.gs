const CONFIG = {
  VISION_API_KEY: PropertiesService.getScriptProperties().getProperty('VISION_API_KEY'),
  INBOUND_FOLDER_ID: PropertiesService.getScriptProperties().getProperty('INBOUND_FOLDER_ID'),
  PROCESSED_FOLDER_ID: PropertiesService.getScriptProperties().getProperty('PROCESSED_FOLDER_ID'),
  LOG_LEVEL: PropertiesService.getScriptProperties().getProperty('LOG_LEVEL') || "INFO",

  SHEET_NAME: "Receipts",
  LOG_SHEET: "OCR_Log",

  PARSER_TYPE: "VISION" // future: DOCUMENT_AI
};
