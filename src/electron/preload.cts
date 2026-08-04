const electron = require('electron');

electron.contextBridge.exposeInMainWorld("electron", {
  subscribeStatistics: (callback: (statistics: Statistics) => void) => {
    electron.ipcRenderer.on("statistics", (_: unknown, stats: Statistics) => {
      callback(stats)
    })
  },

  getStaticData: () => electron.ipcRenderer.invoke("getStaticData"),

  // ---- scraping ----
  scrapeLinkedIn: (params: SearchParams) => electron.ipcRenderer.invoke("scrapeLinkedIn", params),

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

  // ---- resume ----
  pickResume: () => electron.ipcRenderer.invoke("pickResume"),

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

  setKeywordWeight: (id: number, weight: number) =>
    electron.ipcRenderer.invoke("setKeywordWeight", id, weight),

  resetKeywords: () => electron.ipcRenderer.invoke("resetKeywords"),

  // ---- insights ----
  getInsights: () => electron.ipcRenderer.invoke("getInsights"),
})
