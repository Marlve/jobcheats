import { ipcMain } from "electron";
import { linkedinService} from "../services/websiteService.js";

export function registerWebsiteIPC () {
  ipcMain.handle("openLinkedIn", async () => {
    return linkedinService.login()
  });

  ipcMain.handle("scrapeLinkedIn", () => {
    return linkedinService.scrapeJobs()
  });
}
