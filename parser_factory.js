/**
 * ParserFactory
 * Returns the appropriate parser based on PROCESSOR_MODE.
 * Add new parser implementations here as they become available.
 */
const ParserFactory = {
  getParser() {
    const mode = PropertiesService.getScriptProperties().getProperty("PROCESSOR_MODE")
      || APP_DEFAULTS.PROCESSOR_MODE;

    switch (mode) {
      case "OCR_RULE":
        return VisionParser;
      case "DOCUMENT_AI":
        throw new Error("DocumentAI parser is not yet implemented");
      default:
        throw new Error(`Unknown PROCESSOR_MODE: "${mode}"`);
    }
  }
};
