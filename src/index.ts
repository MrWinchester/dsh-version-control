/**
 * dsh-version — host half. Probes the installed dsh core version from the
 * runtime tree, polls GitHub Releases for the latest dsh release on a
 * configurable schedule (default 3 hours, npm dist-tags as fallback), exposes
 * the /api/dsh-version route family, and runs the profile update when asked.
 * The browser half (./client) renders the two-number status panel.
 * Everything rides official NPM SDK packages — no dsh source changes.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { makeRoutes } from './routes.ts'
import { mountOnce } from './mount-once.ts'
import { registryDistTagsUrl, TRACKED_PACKAGE, VersionStore } from './store.ts'
import { githubReleasesUrl, pickNewestReleaseVersion, pickNpmDistTagVersion } from './versions.ts'
import { createUpdateRunner } from './update-runner.ts'
import { findProfileDir, findProfilesByDependency } from './versions.ts'

/** This plugin's own package name (matches dependencies entries in profiles). */
export const PLUGIN_PACKAGE = '@linxin666/dsh-version' as const

/** Stable cordis plugin name. */
export const name = 'dsh-version'

/** Services required before the version surfaces can mount. */
export const inject = ['webServer', 'systemPrompt']

/**
 * Settings namespace of the version capability — the section the web settings
 * surface edits. Spelled here rather than imported: the browser half spells
 * the same value and must not depend on a Host package.
 */
export const VERSION_SETTINGS_NAMESPACE = settingsNamespace('dsh-version')

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /**
   * How often the host re-checks the registry, in minutes. Changed from the
   * web settings surface; the running poller re-arms on change.
   */
  checkIntervalMinutes?: number
  /**
   * When true (default), a system-prompt section announces the version
   * plugin to every agent. Set false to keep it silent.
   */
  announceToAgent?: boolean
  /** Master switch for the plugin (routes, poller, prompt section). */
  enabled?: boolean
}

export const Config: z<Config> = z.object({
  checkIntervalMinutes: z.number().min(1).max(10080).default(180),
  announceToAgent: z.boolean().default(true),
  enabled: z.boolean().default(true),
})

/** Schema default, re-read for hand-built test contexts (the loader applies them normally). */
const DEFAULT_CHECK_INTERVAL = 180
const DEFAULT_ANNOUNCE = true

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 152

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const VERSION_GUIDANCE = '本机已安装 dsh-version 插件（DSH 版本查看）：侧边栏「DSH 版本」入口。能力：展示本地（当前客户端）DSH 核心版本与最新发布版本（以 GitHub Releases 为准，npm dist-tags 兜底），支持「立即检查」与可配置的定时检查（默认 3 小时一次）；「更新」按钮将 ~/.dsh 下 profile 中的 dsh / dsh-base / dsh-web-app 升级到检测到的最新版本（更新后需重启 dsh web 生效）。版本数据经 /api/dsh-version/* 提供（仅 loopback 可访问）。注意：更新会真实改写 profile 的依赖安装，先与用户确认再操作。用户提到「DSH 版本 / 版本号 / 检查更新 / 更新 DSH」时即指本插件，请据此协作。'

/** Read one package.json (JSON.parse; undefined when missing or broken). */
function readManifest(path: string): unknown | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

/**
 * Mount the version probe, poller, routes, and announcement.
 * @param ctx - host plugin context carrying webServer/systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export const apply = mountOnce('@linxin666/dsh-version', applyImpl)

function applyImpl(ctx: Context, config?: Config): void {
  // The live source the surfaces read: the settings section once the web
  // settings surface is served, the composition entry otherwise.
  let current: () => Config = () => config ?? {}
  const resolve = (): Required<Config> => {
    const value = current()
    return {
      checkIntervalMinutes: value.checkIntervalMinutes ?? DEFAULT_CHECK_INTERVAL,
      announceToAgent: value.announceToAgent ?? DEFAULT_ANNOUNCE,
      enabled: value.enabled ?? true,
    }
  }

  // Runtime tree: resolve installs from the plugin's own home (the profile
  // node_modules). The module file anchors the profile-directory walk, but a
  // `link:`-mounted plugin is loaded through its symlink target, so the
  // profile is ALSO discovered by scanning ~/.dsh/profiles for manifests
  // that depend on this plugin — that lookup is immune to symlink realpathing.
  const modulePath = fileURLToPath(import.meta.url)
  const requireFromPlugin = createRequire(import.meta.url)
  const resolveVersion = (packageName: string): string | undefined => {
    try {
      const manifest = requireFromPlugin.resolve(`${packageName}/package.json`)
      const record = readManifest(manifest)
      if (typeof record === 'object' && record !== null) {
        const version = (record as { version?: unknown }).version
        return typeof version === 'string' ? version : undefined
      }
    } catch {
      return undefined
    }
    return undefined
  }
  const home = process.env.HOME ?? ''
  const anchoredProfile = findProfileDir(modulePath, readManifest) ?? ''
  const profilesByDependency = home !== ''
    ? findProfilesByDependency(
        home + '/.dsh/profiles',
        PLUGIN_PACKAGE,
        readManifest,
        root => {
          try {
            return readdirSync(root, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name)
          } catch {
            return []
          }
        },
      )
    : []
  const profileDir = profilesByDependency[0] ?? anchoredProfile
  const updatable = profileDir !== ''
  // Precise local version: the dsh core actually installed inside the profile
  // (the version the running GUI is composed from), read directly — the
  // require fallback can resolve into the plugin's own devDependencies tree.
  const profileCoreManifest = profileDir !== '' ? profileDir + '/node_modules/@deepseek-ai/dsh/package.json' : ''
  const probeLocal = (): string => {
    if (profileCoreManifest !== '') {
      const record = readManifest(profileCoreManifest)
      if (typeof record === 'object' && record !== null) {
        const version = (record as { version?: unknown }).version
        if (typeof version === 'string') return version
      }
    }
    return resolveVersion(TRACKED_PACKAGE) ?? ''
  }

  const store = new VersionStore({
    probeLocal,
    fetchLatest: async () => {
      // GitHub Releases is the authoritative release channel: the dsh team
      // publishes rc releases to npm under the `next` dist-tag while `latest`
      // lags behind (rc.8 shipped as next; latest stayed on rc.7). The npm
      // dist-tags remain the fallback when the GitHub API is unreachable.
      try {
        const response = await fetch(githubReleasesUrl(), {
          signal: AbortSignal.timeout(15_000),
          headers: { accept: 'application/vnd.github+json' },
        })
        if (!response.ok) {
          throw new Error(`github releases ${response.status}`)
        }
        const version = pickNewestReleaseVersion(await response.json())
        if (version !== undefined) return version
        throw new Error('GitHub Releases 响应缺少可识别的版本标签')
      } catch (error) {
        const githubReason = error instanceof Error ? error.message : String(error)
        const response = await fetch(registryDistTagsUrl(TRACKED_PACKAGE), {
          signal: AbortSignal.timeout(15_000),
          headers: { accept: 'application/json' },
        })
        if (!response.ok) {
          throw new Error(`github ${githubReason}；registry ${response.status}`)
        }
        // Prefer the highest of `latest` / `next` — both can drift independently.
        const version = pickNpmDistTagVersion(await response.json())
        if (version === undefined) {
          throw new Error(`github ${githubReason}；registry 响应缺少可用的版本标签`)
        }
        return version
      }
    },
    runUpdate: createUpdateRunner(profileDir),
    profileDir,
    profileUpdatable: updatable,
  })
  ctx.effect(() => () => { store.dispose() }, 'dsh-version: store')

  // The three routes.
  let disposeRoutes: (() => void) | undefined
  // System-prompt announcement.
  let disposeSection: (() => void) | undefined
  // The registry poller (re-armed on config change).
  let disposePoller: (() => void) | undefined

  /** Register (or drop) every surface to match the current source. */
  const sync = (): void => {
    if (disposeSection !== undefined) { disposeSection(); disposeSection = undefined }
    if (disposeRoutes !== undefined) { disposeRoutes(); disposeRoutes = undefined }
    if (disposePoller !== undefined) { disposePoller(); disposePoller = undefined }
    const value = resolve()
    if (!value.enabled) return
    if (value.announceToAgent) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:dsh-version',
        order: SECTION_ORDER,
        text: VERSION_GUIDANCE,
      })
    }
    disposeRoutes = ctx.effect(
      () => {
        const disposers = makeRoutes(store).map(route => ctx.webServer.register(route))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-version: routes',
    )
    disposePoller = ctx.effect(
      () => () => { store.stop() },
      'dsh-version: poller',
    )
    if (updatable) store.start(value.checkIntervalMinutes)
  }

  installSettingsSection(ctx, VERSION_SETTINGS_NAMESPACE, Config, config ?? {}, {
    setSource: (source) => {
      current = source
      sync()
    },
    onChange: sync,
  })

  // Initial registration from the composition entry (covers deployments with
  // no settings service, whose installSettingsSection never fires its hooks).
  sync()
}