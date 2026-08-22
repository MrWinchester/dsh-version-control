import { dirname } from 'node:path'

/**
 * Pure version-string helpers: semver-ish comparison for the dsh release
 * line (x.y.z with an optional -rc.N prerelease), profile-directory
 * discovery, and a profile lookup by plugin dependency. Kept framework-free
 * so the store and the unit tests share one implementation.
 */

/**
 * Compare two version strings on the dsh release line (x.y.z or
 * x.y.z-rc.N). A prerelease sorts before the bare release of the same
 * main triple; within rc, the numeric suffix decides. Malformed strings
 * sort below every well-formed one (never throws).
 * @param a - left version.
 * @param b - right version.
 * @returns -1 / 0 / 1 when a sorts before / equal / after b.
 */
export function compareVersions(a: string, b: string): number {
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
export function isNewer(latest: string, installed: string): boolean {
  if (latest === '' || installed === '') return false
  return compareVersions(latest, installed) > 0
}

/**
 * GitHub releases API URL for the dsh repo, newest-first.
 * @param perPage - how many releases to ask for (the response is sorted by publish time, descending).
 * @returns the API endpoint.
 */
export function githubReleasesUrl(perPage = 10): string {
  return `https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=${perPage}`
}

/**
 * Normalize a GitHub release tag to a dsh version string. Accepts
 * `dsh-v0.1.0-rc.8`, `v0.1.0-rc.8`, or `0.1.0-rc.8`; returns undefined for
 * anything that is not on the dsh release line.
 * @param tag - the release `tag_name`.
 * @returns the version, or undefined when malformed.
 */
export function releaseTagToVersion(tag: unknown): string | undefined {
  if (typeof tag !== 'string') return undefined
  const stripped = tag.replace(/^dsh-/, '').replace(/^v/, '')
  return /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(stripped) ? stripped : undefined
}

/**
 * Newest release version from a GitHub releases API payload. Drafts and
 * malformed tags are skipped; when the payload is unsorted the highest
 * version wins, so the result does not depend on response order.
 * @param body - the JSON payload of a `/releases` response.
 * @returns the newest version, or undefined when none is recognizable.
 */
export function pickNewestReleaseVersion(body: unknown): string | undefined {
  if (!Array.isArray(body)) return undefined
  let best: string | undefined
  for (const entry of body) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as { draft?: unknown; tag_name?: unknown }
    if (record.draft === true) continue
    const version = releaseTagToVersion(record.tag_name)
    if (version !== undefined && (best === undefined || compareVersions(version, best) > 0)) best = version
  }
  return best
}

/**
 * Highest version among npm dist-tag values (e.g. `latest` / `next`) from a
 * dist-tags payload. Values off the dsh release line are skipped.
 * @param body - the JSON payload of a dist-tags response.
 * @returns the highest version, or undefined when none is recognizable.
 */
export function pickNpmDistTagVersion(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  let best: string | undefined
  for (const value of Object.values(body as Record<string, unknown>)) {
    if (typeof value !== 'string') continue
    if (releaseTagToVersion(value) === undefined) continue
    if (best === undefined || compareVersions(value, best) > 0) best = value
  }
  return best
}

/** Result of reading one manifest JSON file (undefined when unreadable). */
export type ReadJson = (path: string) => unknown | undefined

/** Walk ancestors of a module file looking for a dsh profile manifest. */
export function findProfileDir(modulePath: string, readJson: ReadJson): string | undefined {
  let dir = dirname(modulePath)
  for (let depth = 0; dir !== '/' && depth < 12; depth++) {
    const manifest = readJson(dir + '/package.json')
    if (typeof manifest === 'object' && manifest !== null) {
      const record = manifest as { name?: unknown; dsh?: { profile?: unknown } }
      const dsh = typeof record.dsh === 'object' && record.dsh !== null ? record.dsh : undefined
      if (dsh?.profile !== undefined || (typeof record.name === 'string' && record.name.startsWith('dsh-profile-'))) {
        return dir
      }
    }
    dir = dirname(dir)
  }
  return undefined
}

/**
 * Find profiles whose manifest declares a dependency on a plugin package.
 * Independent of module-path resolution (immune to symlink realpathing when
 * a plugin is mounted via `dsh plugin add link:<path>`): each profile that
 * lists the plugin in its `dependencies` is one the plugin was mounted into.
 */
export function findProfilesByDependency(
  profilesRoot: string,
  packageName: string,
  readJson: ReadJson,
  listDirs: (root: string) => string[],
): string[] {
  const found: string[] = []
  for (const entry of listDirs(profilesRoot)) {
    if (entry.startsWith('.')) continue
    const manifest = readJson(profilesRoot + '/' + entry + '/package.json')
    if (typeof manifest !== 'object' || manifest === null) continue
    const dependencies = (manifest as { dependencies?: Record<string, unknown> }).dependencies
    if (typeof dependencies === 'object' && dependencies !== null && dependencies[packageName] !== undefined) {
      found.push(profilesRoot + '/' + entry)
    }
  }
  return found
}