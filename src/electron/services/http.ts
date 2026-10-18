import { app } from "electron"
import { FEED_REQUEST_TIMEOUT_MS } from "../config.js"

/**
 * Plain reads of public web pages and feeds, for the sources that need no
 * browser. One place so every request identifies itself the same way and gives
 * up after the same time.
 */

/** `status` is null when no answer came back at all — offline, refused, timed out. */
export class FeedError extends Error {
  constructor(readonly status: number | null, detail: string) {
    super(detail)
    this.name = 'FeedError'
  }
}

async function get(url: string, accept: string): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: accept, 'User-Agent': `jobcheats/${app.getVersion()}` },
      signal: AbortSignal.timeout(FEED_REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    throw new FeedError(null, err instanceof Error ? err.message : String(err))
  }

  if (!response.ok) throw new FeedError(response.status, `${response.status} from ${new URL(url).host}`)
  return response
}

export async function fetchText(url: string): Promise<string> {
  return (await get(url, 'text/html,application/xml;q=0.9,*/*;q=0.8')).text()
}

export async function fetchJson(url: string): Promise<unknown> {
  const response = await get(url, 'application/json')

  try {
    return await response.json()
  } catch {
    throw new FeedError(response.status, `${new URL(url).host} did not return JSON`)
  }
}
