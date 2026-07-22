import { openLogin } from "./browserService.js";
import { saveState, ensureState } from "./stateStorage.js";
import { playwrightService } from "./playwrightService.js";

export const linkedinService = {
  login: async ():Promise<StorageState> => {
    const state = await openLogin(
      "linkedin",
      "https://linkedin.com/login",
      ".linkedin.com",
      (url) => url.includes("/feed")
    );
    saveState("linkedin", state)

    return state
  },

  scrapeJobs: async () => {
    const searchUrl = "https://www.linkedin.com/jobs/search-results/?currentJobId=4443737711&keywords=internship&origin=JOBS_HOME_KEYWORD_HISTORY&geoId=106808692&distance=0.0&f_TPR=r86400"

    const state = await ensureState("linkedin", linkedinService.login)

    const jobs = await playwrightService.scrape(state, searchUrl, (page) =>
      page.evaluate(() => {
        return Array.from(document.querySelectorAll(".job-card-container")).map((el) => ({
          title: el.querySelector(".job-card-list__title")?.textContent?.trim(),
          company: el.querySelector(".job-card-container__company-name")?.textContent?.trim(),
        }));
      })
    );

    console.log(jobs)
    return jobs

  }
}
