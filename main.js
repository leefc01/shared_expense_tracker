/**
 * Entry point for processing all inbound receipt files.
 *
 * Flow:
 * 1. Pull files from inbound folder
 * 2. Process each file via DocumentProcessor (OCR + parse + post-process)
 * 3. Deduplicate using hash
 * 4. Append structured data to sheet
 * 5. Log raw OCR text
 * 6. Move file to processed folder
 */
function processReceipts() {
  LoggerService.info("Starting processing");

  const sheet = SheetService.getReceiptsSheet();
  const logSheet = SheetService.getLogSheet();
  const files = DriveService.getInboundFiles();
  const processedFolder = DriveService.getProcessedFolder();

  // Used to prevent duplicate processing
  const existingHashes = SheetService.getExistingHashes(sheet);

  while (files.hasNext()) {
    const file = files.next();

    try {
      LoggerService.info(`Processing: ${file.getName()}`);

      // Core processing abstraction: OCR + parsing + post-processing (hash,
      // category, fileName, url) are all handled inside DocumentProcessor.
      // Bug 4 fix: the original code re-assigned hash, fileName, url, and
      // category here after DocumentProcessor had already set them, making
      // deduplication work only by accident (the hash check fell between the
      // two assignments). DocumentProcessor is now the single owner of all
      // post-processing; main.js trusts what it returns.
      const parsed = DocumentProcessor.process(file);

      if (!parsed) {
        LoggerService.warn("No data extracted");
        continue;
      }

      // Skip duplicates
      if (existingHashes.has(parsed.hash)) {
        LoggerService.warn("Duplicate detected");
        file.moveTo(processedFolder);
        continue;
      }

      // Write structured data
      SheetService.appendReceipt(sheet, parsed);

      // Log raw OCR for audit/debugging
      SheetService.logOCR(logSheet, parsed.fileName, parsed.rawText);

      // Move file after successful processing
      file.moveTo(processedFolder);

      LoggerService.info(`Done: ${parsed.amount} (${parsed.confidence})`);

    } catch (e) {
      LoggerService.error(e.toString());
    }
  }

  LoggerService.info("Finished processing");
}
