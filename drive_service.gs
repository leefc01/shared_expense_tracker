// drive_service.gs
const DriveService = {
  getInboundFiles() {
    const folderId = PropertiesService.getScriptProperties().getProperty("INBOUND_FOLDER_ID");
    return DriveApp.getFolderById(folderId).getFiles();
  },

  getProcessedFolder() {
    const folderId = PropertiesService.getScriptProperties().getProperty("PROCESSED_FOLDER_ID");
    return DriveApp.getFolderById(folderId);
  }
};
