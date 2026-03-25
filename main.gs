// main.gs
function processReceipts() {
  LoggerService.info("Starting processing");

  const sheet = SheetService.getReceiptsSheet();
  const logSheet = SheetService.getLogSheet();
  const files = DriveService.getInboundFiles();
  const processedFolder = DriveService.getProcessedFolder();
  const existingHashes = SheetService.getExistingHashes(sheet);

  while (files.hasNext()) {
    const file = files.next();
    try {
      LoggerService.info(`Processing: ${file.getName()}`);
      const parsed = VisionParser.parse(file);
      if (!parsed) {
        LoggerService.warn("No text extracted");
        continue;
      }

      parsed.hash = Utils.generateHash(parsed.rawText);
      parsed.fileName = file.getName();
      parsed.url = file.getUrl();

      if (existingHashes.has(parsed.hash)) {
        LoggerService.warn("Duplicate detected");
        file.moveTo(processedFolder);
        continue;
      }

      parsed.category = CategoryClassifier.classify(parsed.rawText, parsed.vendor);

      SheetService.appendReceipt(sheet, parsed);
      SheetService.logOCR(logSheet, parsed.fileName, parsed.rawText);

      file.moveTo(processedFolder);
      LoggerService.info(`Done: ${parsed.amount} (${parsed.confidence})`);

    } catch (e) {
      LoggerService.error(e.toString());
    }
  }

  LoggerService.info("Finished processing");
}
