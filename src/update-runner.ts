/**
 * The update runner: spawns the package manager in the profile directory to
 * upgrade the core packages to the detected version. pnpm is preferred (the
 * profile tree is pnpm-shaped); npm is the fallback when no pnpm is on PATH.
 * The registry is pinned to the official npm registry — mirror registries
 * (npmmirror etc.) routinely miss newer dsh packages and fail the upgrade.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** The official npm registry, pinned for every update run. */
export const OFFICIAL_REGISTRY = 'https://registry.npmjs.org/'

/** How many trailing failure lines are folded into the error message. */
const ERROR_TAIL_LINES = 6

/** Scan PATH for a runnable by name. */
export function findOnPath(name: string): string | undefined {
  const path = process.env.PATH ?? ''
  for (const dir of path.split(':')) {
    if (dir === '') continue
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/**
 * Build the update command runner for a profile directory.
 * @param profileDir - the profile directory the install runs in.
 * @returns the runUpdate dependency the store expects: installs the given
 * package specs (e.g. `@deepseek-ai/dsh@0.1.0-rc.7`) in the profile.
 */
export function createUpdateRunner(profileDir: string) {
  return (specs: readonly string[]): Promise<number | null> => {
    const pnpm = findOnPath('pnpm')
    const npm = findOnPath('npm')
    const command = pnpm ?? npm
    if (command === undefined) {
      throw new Error('PATH 上找不到 pnpm 或 npm，无法执行更新。')
    }
    const args = command.endsWith('/pnpm')
      // dsh ships rc releases near-daily; pnpm's 24h minimum-release-age gate
      // (its default) would block upgrading to a just-published rc even though
      // it is the version this plugin just detected.
      ? ['add', '--config.minimumReleaseAge=0', `--registry=${OFFICIAL_REGISTRY}`, ...specs]
      : ['install', `--registry=${OFFICIAL_REGISTRY}`, ...specs]

    return new Promise((resolve, reject) => {
      const lines: string[] = []
      const child = spawn(command, args, {
        cwd: profileDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const capture = (chunk: Buffer): void => {
        const text = chunk.toString()
        for (const line of text.split(/\r?\n/)) {
          if (line.trim() !== '') {
            lines.push(line.trim())
            if (lines.length > 400) lines.splice(0, lines.length - 400)
          }
        }
      }
      child.stdout?.on('data', capture)
      child.stderr?.on('data', capture)
      child.on('error', error => reject(error))
      child.on('close', (code, signal) => {
        if (signal !== null) {
          reject(new Error(`更新进程被信号 ${signal} 终止`))
          return
        }
        if (code !== 0) {
          const tail = lines.slice(-ERROR_TAIL_LINES).join('\n')
          reject(new Error(`更新命令退出码 ${String(code)}。${tail !== '' ? `\n${tail}` : ''}`))
          return
        }
        resolve(code)
      })
    })
  }
}