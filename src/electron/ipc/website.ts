import { ipcMain } from "electron";
import { linkedinService} from "../services/websiteService.js";

export function registerWebsiteIPC () {
  ipcMain.handle("scrapeLinkedIn", () => {
    return linkedinService.scrapeJobs()
  });
}
