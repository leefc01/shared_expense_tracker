/**
 * OCRService
 * Handles text extraction using Vision API, Drive OCR, or native text parsing.
 */
const OCRService = {
  extractText(file) {
    const mode = PropertiesService.getScriptProperties().getProperty("OCR_MODE") || APP_DEFAULTS.OCR_MODE;
    const mime = file.getMimeType();
    LoggerService.info(`File type: ${mime}, OCR_MODE: ${mode}`);

    if (APP_DEFAULTS.DOCUMENT_MIMES.includes(mime)) {
      LoggerService.info("Using Drive OCR for document file");
      return this.extractWithDrive(file);
    }

    if (mime.startsWith("text/")) {
      LoggerService.info("Using native text parser");
      try { return file.getBlob().getDataAsString(); }
      catch (e) { LoggerService.error("Failed to read text file: " + e.toString()); return null; }
    }

    if (APP_DEFAULTS.IMAGE_MIMES.includes(mime) || mime === APP_DEFAULTS.PDF_MIME) {
      if (mode === "DRIVE") {
        LoggerService.info("Using Drive OCR for image/pdf");
        const text = this.extractWithDrive(file);
        if (text) return text;
        LoggerService.warn("Drive OCR failed, falling back to Vision");
      }
      LoggerService.info("Using Vision OCR for image/pdf");
      return this.extractWithVision(file);
    }

    LoggerService.warn("Unsupported file type: " + mime);
    return null;
  },

  extractWithVision(file) {
    return VisionService.extractText(file);
  },

  // Bug 2 fix: temp file was only deleted on the happy path. If openById() or
  // getText() threw, the catch block swallowed the error and Drive.Files.remove()
  // was never reached, permanently orphaning the temp doc. Use try/finally so
  // cleanup always runs regardless of whether extraction succeeded or failed.
  extractWithDrive(file) {
    const resource = {
      title: "temp_ocr_" + new Date().getTime(),
      mimeType: "application/vnd.google-apps.document"
    };
    let temp;
    try {
      temp = Drive.Files.copy(resource, file.getId());
      return DocumentApp.openById(temp.id).getBody().getText();
    } catch (e) {
      LoggerService.error("Drive OCR failed: " + e.toString());
      return null;
    } finally {
      if (temp) {
        try { Drive.Files.remove(temp.id); }
        catch (e) { LoggerService.warn("Failed to delete temp OCR file: " + e.toString()); }
      }
    }
  }
};
