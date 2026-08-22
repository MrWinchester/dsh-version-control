/**
 * Shared panel helpers: the active-dictionary pick (document-language based,
 * family precedent) bound to the dsh-version interpolator in locales.ts, plus
 * a small error-message extractor. All copy stays in the locale dictionaries.
 */
import { en, t, zh, type VersionKey } from '../locales.ts'

/** Template values accepted by the interpolator. */
export type TranslateValues = Record<string, string | number>

/** Active dictionary, picked by the document language at call time. */
export function dictionary(): Record<string, string> {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'zh'
  return lang.toLowerCase().startsWith('en') ? { ...en } : { ...zh }
}

/** Translate a key with optional {name} template params (current language). */
export function tt(key: VersionKey, values?: TranslateValues): string {
  return t(dictionary(), key, values)
}

/** Human-readable error text from an unknown thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Format an epoch-ms timestamp as a locale time string ('--' when absent). */
export function formatTime(epochMs: number | undefined): string {
  if (epochMs === undefined) return '--'
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(epochMs)
}

/**
 * Compare two versions on the dsh release line (x.y.z or x.y.z-rc.N).
 * Browser-safe copy of the host comparator (no node imports — the client
 * bundle must not require host modules).
 * @param a - left version.
 * @param b - right version.
 * @returns -1 / 0 / 1 when a sorts before / equal / after b.
 */
export function compareVersion(a: string, b: string): number {
  const parse = (value: string): { main: number[]; rc: number } | undefined => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/.exec(value.trim())
    if (match === null) return undefined
    return { main: [Number(match[1]), Number(match[2]), Number(match[3])], rc: match[4] === undefined ? Number.POSITIVE_INFINITY : Number(match[4]) }
  }
  const pa = parse(a)
  const pb = parse(b)
  if (pa === undefined && pb === undefined) return a === b ? 0 : a < b ? -1 : 1
  if (pa === undefined) return -1
  if (pb === undefined) return 1
  for (let i = 0; i < 3; i++) {
    if (pa.main[i] !== pb.main[i]) return pa.main[i] < pb.main[i] ? -1 : 1
  }
  if (pa.rc === pb.rc) return 0
  return pa.rc < pb.rc ? -1 : 1
}

/** Whether a latest version is a genuine upgrade over the installed one. */
export function isNewerVersion(latest: string, installed: string): boolean {
  if (latest === '' || installed === '') return false
  return compareVersion(latest, installed) > 0
}