const electron = require('electron');

electron.contextBridge.exposeInMainWorld("electron", {
  // ---- scraping ----
  scrapeAll: (params: SearchParams) => electron.ipcRenderer.invoke("scrapeAll", params),

  cancelScrape: () => electron.ipcRenderer.invoke("cancelScrape"),

  subscribeScrapeProgress: (callback: (progress: ScrapeProgress) => void) => {
    const listener = (_: unknown, progress: ScrapeProgress) => callback(progress)
    electron.ipcRenderer.on("scrape:progress", listener)
    return () => electron.ipcRenderer.off("scrape:progress", listener)
  },

  listRuns: (limit?: number) => electron.ipcRenderer.invoke("listRuns", limit),

  // ---- jobs ----
  listJobs: (options?: ListJobsOptions) => electron.ipcRenderer.invoke("listJobs", options),

  countJobs: (options?: ListJobsOptions) => electron.ipcRenderer.invoke("countJobs", options),

  updateJobStatus: (id: number, status: JobStatus) =>
    electron.ipcRenderer.invoke("updateJobStatus", id, status),

  setJobNotes: (id: number, notes: string) =>
    electron.ipcRenderer.invoke("setJobNotes", id, notes),

  getDbStats: () => electron.ipcRenderer.invoke("getDbStats"),

  pruneOldJobs: () => electron.ipcRenderer.invoke("pruneOldJobs"),

  getAppConfig: () => electron.ipcRenderer.invoke("getAppConfig"),

  // ---- resume ----
  pickResume: () => electron.ipcRenderer.invoke("pickResume"),

  /**
   * Electron removed `File.path`, so a dropped file's location can only be
   * resolved here in the preload. Returns '' if the object isn't a real file.
   */
  getPathForFile: (file: File): string => {
    try {
      return electron.webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },

  uploadResume: (filePath: string) => electron.ipcRenderer.invoke("uploadResume", filePath),

  getResume: () => electron.ipcRenderer.invoke("getResume"),

  deleteResume: () => electron.ipcRenderer.invoke("deleteResume"),

  // ---- keywords ----
  listKeywords: () => electron.ipcRenderer.invoke("listKeywords"),

  addKeyword: (keyword: string, weight?: number) =>
    electron.ipcRenderer.invoke("addKeyword", keyword, weight),

  removeKeyword: (id: number) => electron.ipcRenderer.invoke("removeKeyword", id),

  setKeywordEnabled: (id: number, enabled: boolean) =>
    electron.ipcRenderer.invoke("setKeywordEnabled", id, enabled),

  resetKeywords: () => electron.ipcRenderer.invoke("resetKeywords"),

  // ---- insights ----
  getInsights: () => electron.ipcRenderer.invoke("getInsights"),
})
