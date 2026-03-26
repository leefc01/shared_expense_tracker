/**
 * DocumentProcessor
 * Unified interface for file processing (OCR + rule-based parsing).
 */
const DocumentProcessor = {
  process(file) {
    const props = PropertiesService.getScriptProperties();
    const options = {
      mode: props.getProperty("PROCESSOR_MODE") || APP_DEFAULTS.PROCESSOR_MODE,
      mlMode: props.getProperty("ML_MODE") || APP_DEFAULTS.ML_MODE
    };
    LoggerService.info(`Processor Mode: ${options.mode}, ML Mode: ${options.mlMode}`);

    let parser;
    try {
      parser = ParserFactory.getParser();
    } catch (e) {
      LoggerService.error("Parser selection failed: " + e.toString());
      return null;
    }

    let text;
    try { text = OCRService.extractText(file); }
    catch (e) { LoggerService.error("OCR failed: " + e.toString()); return null; }

    if (!text) {
      LoggerService.warn("No text extracted from file");
      return null;
    }

    const parsed = parser.parseFromText(text, file);

    // Post-processing: hash, category, filename, url
    parsed.hash = Utils.generateHash(parsed.rawText);
    parsed.fileName = file.getName();
    parsed.url = file.getUrl();
    parsed.category = CategoryClassifier.classify(parsed.rawText, parsed.vendor);

    return parsed;
  }
};
