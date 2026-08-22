/**
 * Wire contract between the host half (routes.ts / store.ts) and the browser
 * half (client/api.ts). Pure types plus the shared route-path literals —
 * imported by both halves, bundled into each, no runtime identity to share.
 */

/** Route paths the client calls (shared literals). */
export const VERSION_API_BASE = '/api/dsh-version' as const

export const VERSION_API = {
  status: VERSION_API_BASE + '/status',
  refresh: VERSION_API_BASE + '/refresh',
  update: VERSION_API_BASE + '/update',
} as const

/** The update runner's observable state (the panel shows one banner). */
export interface UpdateState {
  /** idle | running | success | failed */
  state: 'idle' | 'running' | 'success' | 'failed'
  /** Failure message (state === 'failed'). */
  error?: string
}

/** Full snapshot served by GET /api/dsh-version/status. */
export interface VersionStatus {
  /** The installed dsh core version ('' when not resolvable). */
  localVersion: string
  /** The latest published dsh version (GitHub Releases, npm dist-tags fallback; '' while unknown). */
  latestVersion: string
  /** True while a version re-check is in flight. */
  checking: boolean
  /** Epoch ms of the last completed version check. */
  lastCheckedAt?: number
  /** Effective polling interval in minutes. */
  checkIntervalMinutes: number
  /** Whether a profile install was detected (update enabled). */
  profileUpdatable: boolean
  /** Profile directory the update command would run in. */
  profileDir: string
  /** The update runner state. */
  update: UpdateState
}

/** Simple JSON error body (shared with the client's error extraction). */
export interface ApiErrorBody {
  error: string
}