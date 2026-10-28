/**
 * Reading who a board says is signed in. Pure: a reply or a page's text in,
 * an identity out, so each rule can be checked without a browser.
 */

export interface Identity {
  name: string
  /** A second line that tells two accounts apart: a profile link or an email. */
  detail?: string
}

/** The first object anywhere in `value` that carries a first name. */
function findProfile(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || value === null || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.firstName === 'string' && record.firstName.trim()) return record

  for (const child of Object.values(record)) {
    const found = findProfile(child, depth + 1)
    if (found) return found
  }
  return null
}

/**
 * LinkedIn's /voyager/api/me reply. Its shape differs between the normalized
 * and plain formats, so this looks for the profile object rather than a path.
 */
export function linkedInIdentity(body: unknown): Identity | null {
  const profile = findProfile(body)
  if (!profile) return null

  const text = (key: string) => (typeof profile[key] === 'string' ? (profile[key] as string).trim() : '')
  const name = [text('firstName'), text('lastName')].filter(Boolean).join(' ')
  const handle = text('publicIdentifier')
  return { name, detail: handle ? `linkedin.com/in/${handle}` : undefined }
}

/** Seek sends a signed-out visitor to its login host, or to its own /oauth/login page. */
export function isSeekSignInUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url)
    return hostname.startsWith('login.') || pathname.startsWith('/oauth/login')
  } catch {
    return false
  }
}

/** The profile page heading, when it reads as a person's name rather than a page title. */
export function seekName(heading: string): string | undefined {
  const text = heading.replace(/\s+/g, ' ').trim()
  if (text.length < 2 || text.length > 60) return undefined
  if (/\b(profile|seek|sign in|jobs?)\b/i.test(text)) return undefined
  return text
}
