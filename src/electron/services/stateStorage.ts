import fs from "fs";
import path from "path";
import { app } from "electron";

function statePath(siteName: string): string {
  return path.join(app.getPath("userData"), `${siteName}-state.json`)
}

export function loadState(siteName: string): StorageState | null {
  const p = statePath(siteName);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function saveState(siteName:string, state: StorageState): void {
  fs.writeFileSync(statePath(siteName), JSON.stringify(state, null, 2))
}

export async function ensureState(
  siteName: string,
  loginFn: () => Promise<StorageState>
): Promise<StorageState> {
  const cached = loadState(siteName);
  if (cached) return cached;

  return loginFn();
}
