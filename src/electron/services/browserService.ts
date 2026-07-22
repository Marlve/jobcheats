import { BrowserWindow} from "electron";

export function openLogin(
  partition: string,
  loginUrl: string,
  cookieDomain: string,
  successCheck: (url: String) => boolean
): Promise<StorageState> {
    return new Promise((resolve) => {
      const window = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          partition: `persist:${partition}`
        }
      });

      window.loadURL(loginUrl);

      window.webContents.on("did-navigate", async (_, url) => {
        if (successCheck(url)) {
          console.log("Logged In!");

          const state = await exportStorageState(cookieDomain, window)
          window.close();
          resolve(state);
        }
      })
    })
};

// HELPERS
const domainToOrigin = (cookieDomain: string): string => {
  const host = cookieDomain.startsWith(".") ? cookieDomain.slice(1) : cookieDomain;
  return `https://${host}`;
}

const sameSiteMap: Record<string, PlaywrightCookie["sameSite"]> = {
  no_restriction: "None",
  lax: "Lax",
  strict: "Strict",
  unspecified: "Lax",
};

// Takes electron session to handle cookies and transform it to playwright cookies.
async function exportStorageState(
  cookieDomain: string,
  win: BrowserWindow
): Promise<StorageState> {
  const ses = win.webContents.session;
  const rawCookies = await ses.cookies.get({});

  const cookies: PlaywrightCookie[] = rawCookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain ?? cookieDomain,
    path: c.path ?? "/",
    expires: c.expirationDate ?? - 1,
    httpOnly: c.httpOnly ?? false,
    secure: c.secure ?? false,
    sameSite: sameSiteMap[c.sameSite ?? "unspecified"] ?? "Lax",
  }))

  const localStorageEntries: [string, string][] = await win.webContents.executeJavaScript("Object.entries(localStorage)");

  return {
    cookies,
    origins: [
      {
        origin: domainToOrigin(cookieDomain),
        localStorage: localStorageEntries.map(([name, value]) => ({name, value}))
      }
    ]
  }
}

