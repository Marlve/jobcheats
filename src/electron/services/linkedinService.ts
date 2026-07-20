import { openLogin } from "./browserService.js"

export const linkedinService = {
  openLogin: () => openLogin(
    "linkedin",
    "https://linkedin.com/login",
    (url) => url.includes("/feed")
  )
}
