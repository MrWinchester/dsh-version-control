/**
 * dsh-version host store: owns the two version numbers the panel shows — the
 * installed dsh core version (probed from the runtime tree) and the latest
 * published version (polled from the npm registry) — the configurable
 * polling schedule, and the pnpm update runner. The web routes and the
 * settings surface read and drive this single owner.
 */

import type { UpdateState, VersionStatus } from './protocol.ts'

/** Registry endpoint returning dist-tags JSON for one package. */
export function registryDistTagsUrl(packageName: string): string {
  return `https://registry.npmjs.org/-/package/${encodeURIComponent(packageName)}/dist-tags`
}

/** Core trio the update bumps together. */
export const CORE_UPDATE_TARGETS = [
  '@deepseek-ai/dsh',
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
] as const

/** The package whose version the panel displays. */
export const TRACKED_PACKAGE = '@deepseek-ai/dsh' as const

/** Dependencies the store needs injected (tests swap fetch and the runner). */
export interface VersionStoreDeps {
  /** Resolve the installed dsh core version ('' when not resolvable). */
  probeLocal: () => string
  /** Resolve the latest published dsh version (registry fetch). */
  fetchLatest: () => Promise<string>
  /** Run the update command; resolves with the child's exit code (null when it never started). */
  runUpdate: (packages: readonly string[]) => Promise<number | null>
  /** Human label for the update target directory ('' when none). */
  profileDir: string
  /** Whether a profile install was detected (update enabled). */
  profileUpdatable: boolean
}

/** The store's observable face (routes and tests). */
export interface VersionStoreLike {
  status(): VersionStatus
  refresh(): void
  update(): void
  /** Start the scheduled registry polling (immediate first check). */
  start(intervalMinutes: number): void
  /** Stop the scheduled polling (does not cancel an in-flight check). */
  stop(): void
}

/**
 * The version capability's single state owner. Polling and updates run
 * inside the host process; the store never touches the filesystem itself —
 * probing and the update runner arrive as injected dependencies.
 */
export class VersionStore implements VersionStoreLike {
  private checking = false
  private lastCheckedAt: number | undefined
  private latestVersion = ''
  private registryError = ''
  private timer: ReturnType<typeof setInterval> | undefined
  private disposed = false
  private checkIntervalMinutes = 0
  private readonly updateState: UpdateState = { state: 'idle' }

  constructor(private readonly deps: VersionStoreDeps) {}

  status(): VersionStatus {
    return {
      localVersion: this.deps.probeLocal(),
      latestVersion: this.registryError !== '' ? '' : this.latestVersion,
      checking: this.checking,
      lastCheckedAt: this.lastCheckedAt,
      checkIntervalMinutes: this.checkIntervalMinutes,
      profileUpdatable: this.deps.profileUpdatable,
      profileDir: this.deps.profileDir,
      update: { ...this.updateState },
    }
  }

  /** Kick an immediate registry re-check (non-blocking; status shows checking). */
  refresh(): void {
    if (this.checking) return
    void this.checkNow()
  }

  /** Start the scheduled checks: one immediate check, then the interval. */
  start(intervalMinutes: number): void {
    this.checkIntervalMinutes = intervalMinutes
    void this.checkNow()
    this.stop()
    this.timer = setInterval(() => { void this.checkNow() }, Math.max(1, intervalMinutes) * 60_000)
  }

  /** Stop the scheduled checks. */
  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  /**
   * Start the update run; throws with a user-facing message when busy,
   * unsupported, or when the latest version is not yet known.
   */
  update(): void {
    if (!this.deps.profileUpdatable) {
      throw new Error('未检测到可更新的 profile 安装（没有找到 ~/.dsh/<profile> 目录）。')
    }
    if (this.updateState.state === 'running') {
      throw new Error('更新已在运行中。')
    }
    if (this.latestVersion === '') {
      throw new Error('尚未取得最新版本号，请先「立即检查」再更新。')
    }
    this.updateState.state = 'running'
    this.updateState.error = undefined
    void this.runUpdateInBackground(this.latestVersion)
  }

  /** Dispose: stop timers (in-flight work settles on its own). */
  dispose(): void {
    this.disposed = true
    this.stop()
  }

  private async checkNow(): Promise<void> {
    if (this.disposed) return
    this.checking = true
    try {
      const version = await this.deps.fetchLatest()
      if (this.disposed) return
      this.latestVersion = version
      this.registryError = ''
    } catch (error) {
      if (this.disposed) return
      // Keep the previous value; the panel shows '--' and a failure hint.
      this.registryError = error instanceof Error ? error.message : String(error)
    }
    this.checking = false
    this.lastCheckedAt = Date.now()
  }

  private async runUpdateInBackground(version: string): Promise<void> {
    try {
      // All three core packages share one version line; pin them to that same
      // version instead of the `latest` dist-tag — the registry's latest tag
      // for dsh-base / dsh-web-app is broken (it points at 0.0.1-rc.1, which
      // depends on never-published packages), while dsh@latest is sane.
      const specs = CORE_UPDATE_TARGETS.map(packageName => `${packageName}@${version}`)
      const exitCode = await this.deps.runUpdate(specs)
      this.updateState.state = exitCode === 0 ? 'success' : 'failed'
      if (exitCode !== 0) {
        this.updateState.error = `更新命令退出码 ${String(exitCode)}。`
      }
    } catch (error) {
      this.updateState.state = 'failed'
      this.updateState.error = error instanceof Error ? error.message : String(error)
    }
  }
}