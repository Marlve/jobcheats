import { openLogin } from "./browserService.js";

export const seekService = {
  openLogin: () => openLogin(
    "seek",
    "https://seek.com/login",
    (url) => url.includes("/dashboard")
  )
}
