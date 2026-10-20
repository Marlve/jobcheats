const electron = require('electron');

electron.contextBridge.exposeInMainWorld("electron", {
  // ---- window ----

  /**
   * The window's title bar is drawn by the app, so the renderer has to know
   * which platform's controls it is leaving room for: buttons top-right on
   * Windows and Linux, traffic lights top-left on macOS.
   */
  platform: process.platform,

  minimizeWindow: () => electron.ipcRenderer.invoke("minimizeWindow"),

  toggleMaximizeWindow: () => electron.ipcRenderer.invoke("toggleMaximizeWindow"),

  closeWindow: () => electron.ipcRenderer.invoke("closeWindow"),

  isWindowMaximized: () => electron.ipcRenderer.invoke("isWindowMaximized"),

  subscribeWindowMaximized: (callback: (maximized: boolean) => void) => {
    const listener = (_: unknown, maximized: boolean) => callback(maximized)
    electron.ipcRenderer.on("window:maximized", listener)
    return () => electron.ipcRenderer.off("window:maximized", listener)
  },

  // ---- scraping ----
  scrapeAll: (params: SearchParams) => electron.ipcRenderer.invoke("scrapeAll", params),

  cancelScrape: () => electron.ipcRenderer.invoke("cancelScrape"),

  subscribeScrapeProgress: (callback: (progress: ScrapeProgress) => void) => {
    const listener = (_: unknown, progress: ScrapeProgress) => callback(progress)
    electron.ipcRenderer.on("scrape:progress", listener)
    return () => electron.ipcRenderer.off("scrape:progress", listener)
  },

  listRuns: (limit?: number) => electron.ipcRenderer.invoke("listRuns", limit),

  // ---- job boards ----
  listBoards: () => electron.ipcRenderer.invoke("listBoards"),

  setBoardEnabled: (source: JobSource, enabled: boolean) =>
    electron.ipcRenderer.invoke("setBoardEnabled", source, enabled),

  signIn: (source: JobSource) => electron.ipcRenderer.invoke("signIn", source),

  // ---- autofill ----
  getProfile: () => electron.ipcRenderer.invoke("getProfile"),

  saveProfile: (profile: Profile) => electron.ipcRenderer.invoke("saveProfile", profile),

  autofill: (url: string) => electron.ipcRenderer.invoke("autofill", url),
  cancelAutofill: () => electron.ipcRenderer.invoke("cancelAutofill"),
  listAnswers: () => electron.ipcRenderer.invoke("listAnswers"),
  saveAnswer: (question: string, answer: string) =>
    electron.ipcRenderer.invoke("saveAnswer", question, answer),
  deleteAnswer: (question: string) => electron.ipcRenderer.invoke("deleteAnswer", question),
  getCoverLetterEnabled: () => electron.ipcRenderer.invoke("getCoverLetterEnabled"),
  setCoverLetterEnabled: (enabled: boolean) =>
    electron.ipcRenderer.invoke("setCoverLetterEnabled", enabled),

  // ---- scheduled scan ----
  getSchedule: () => electron.ipcRenderer.invoke("getSchedule"),

  saveSchedule: (config: ScheduleConfig) => electron.ipcRenderer.invoke("saveSchedule", config),

  clearSchedule: () => electron.ipcRenderer.invoke("clearSchedule"),

  // ---- updates ----
  getUpdateStatus: () => electron.ipcRenderer.invoke("getUpdateStatus"),

  checkForUpdates: () => electron.ipcRenderer.invoke("checkForUpdates"),

  dismissUpdate: (version: string) => electron.ipcRenderer.invoke("dismissUpdate", version),

  setUpdateAutoCheck: (enabled: boolean) =>
    electron.ipcRenderer.invoke("setUpdateAutoCheck", enabled),

  subscribeUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_: unknown, status: UpdateStatus) => callback(status)
    electron.ipcRenderer.on("update:status", listener)
    return () => electron.ipcRenderer.off("update:status", listener)
  },

  // ---- pipeline ----
  getPipeline: () => electron.ipcRenderer.invoke("getPipeline"),

  // ---- search history ----
  listSearchHistory: () => electron.ipcRenderer.invoke("listSearchHistory"),

  removeSearchHistory: (id: string) => electron.ipcRenderer.invoke("removeSearchHistory", id),

  clearSearchHistory: () => electron.ipcRenderer.invoke("clearSearchHistory"),

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
