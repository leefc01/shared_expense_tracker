/**
 * DriveService
 * Handles inbound/processed folder retrieval.
 */
const DriveService = {
  // Bug 6 fix: if folder ID properties are not set, DriveApp.getFolderById(null)
  // throws a cryptic internal error with no hint about what's misconfigured.
  // Fail fast with a clear message so setup problems are immediately obvious.
  getInboundFiles() {
    const folderId = PropertiesService.getScriptProperties().getProperty("INBOUND_FOLDER_ID");
    if (!folderId) throw new Error("Script property INBOUND_FOLDER_ID is not set.");
    return DriveApp.getFolderById(folderId).getFiles();
  },

  getProcessedFolder() {
    const folderId = PropertiesService.getScriptProperties().getProperty("PROCESSED_FOLDER_ID");
    if (!folderId) throw new Error("Script property PROCESSED_FOLDER_ID is not set.");
    return DriveApp.getFolderById(folderId);
  }
};
