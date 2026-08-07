/**
 * Version comparison.
 *
 * Kept free of any Electron or database import so it can be unit-tested: this
 * is the piece that decides whether to interrupt someone with an update notice,
 * and getting it backwards either nags people who are current or hides a
 * release from people who are not.
 *
 * Follows semver's precedence rules, including the two that are easy to get
 * wrong: a pre-release sorts *below* the version it leads up to (1.0.0-beta is
 * older than 1.0.0), and build metadata after a + is ignored entirely.
 */

interface ParsedVersion {
  /** major, minor, patch — however many parts were actually written. */
  release: number[]
  /** The dot-separated identifiers after a -, empty for a plain release. */
  prerelease: string[]
}

function parseVersion(version: string): ParsedVersion | null {
  if (typeof version !== 'string') return null

  // Release tags are conventionally written v1.2.0 while package.json says
  // 1.2.0. They mean the same version, so the v is dropped before comparing.
  const cleaned = version.trim().replace(/^v/i, '')
  if (!cleaned) return null

  const withoutBuild = cleaned.split('+')[0]
  const dash = withoutBuild.indexOf('-')
  const core = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash)
  const prerelease = dash === -1 ? '' : withoutBuild.slice(dash + 1)

  // Each part must be written out as digits. Testing the text rather than the
  // parsed number matters because Number('') is 0, which would let '..' and a
  // leading dot through as version zero.
  const coreParts = core.split('.')
  if (coreParts.some(part => !/^\d+$/.test(part))) return null

  return {
    release: coreParts.map(Number),
    prerelease: prerelease ? prerelease.split('.') : [],
  }
}

/** Whether a string is a version this code can reason about at all. */
export function isVersion(version: string): boolean {
  return parseVersion(version) !== null
}

function comparePrerelease(left: string[], right: string[]): number {
  // A pre-release is a run-up to its release, so it ranks below it. Two plain
  // releases that got this far are equal.
  if (!left.length && !right.length) return 0
  if (!left.length) return 1
  if (!right.length) return -1

  const count = Math.max(left.length, right.length)

  for (let index = 0; index < count; index++) {
    const l = left[index]
    const r = right[index]

    // Ran out of identifiers — a shorter pre-release ranks lower, so
    // 1.0.0-beta is older than 1.0.0-beta.1.
    if (l === undefined) return -1
    if (r === undefined) return 1

    const lNumeric = /^\d+$/.test(l)
    const rNumeric = /^\d+$/.test(r)

    if (lNumeric && rNumeric) {
      const diff = Number(l) - Number(r)
      if (diff !== 0) return Math.sign(diff)
    } else if (lNumeric !== rNumeric) {
      // Numeric identifiers always rank below alphanumeric ones, so
      // 1.0.0-2 is older than 1.0.0-alpha.
      return lNumeric ? -1 : 1
    } else if (l !== r) {
      return l < r ? -1 : 1
    }
  }

  return 0
}

/**
 * Above zero if `a` is newer than `b`, below if older, zero if they match.
 *
 * A version that cannot be parsed compares equal to everything. That is the
 * safe direction: an unreadable tag means no update is offered, rather than one
 * being offered on a guess.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return 0

  const count = Math.max(left.release.length, right.release.length)

  for (let index = 0; index < count; index++) {
    // A missing part is a zero, so 1.2 and 1.2.0 are the same version.
    const diff = (left.release[index] ?? 0) - (right.release[index] ?? 0)
    if (diff !== 0) return Math.sign(diff)
  }

  return comparePrerelease(left.prerelease, right.prerelease)
}

/** Whether `candidate` is worth telling someone on `current` about. */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}
