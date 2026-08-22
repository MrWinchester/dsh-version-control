import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  findProfileDir,
  findProfilesByDependency,
  githubReleasesUrl,
  isNewer,
  pickNewestReleaseVersion,
  pickNpmDistTagVersion,
  releaseTagToVersion,
} from '../src/versions.ts'

describe('compareVersions', () => {
  it('orders the dsh release line', () => {
    expect(compareVersions('0.1.0-rc.6', '0.1.0-rc.7')).toBe(-1)
    expect(compareVersions('0.1.0-rc.7', '0.1.0-rc.6')).toBe(1)
    expect(compareVersions('0.1.0-rc.7', '0.1.0-rc.7')).toBe(0)
    expect(compareVersions('0.1.0', '0.1.0-rc.7')).toBe(1)
    expect(compareVersions('0.2.0', '0.1.20')).toBe(1)
    expect(compareVersions('1.0.0', '0.99.99')).toBe(1)
  })

  it('sorts malformed versions below well-formed ones without throwing', () => {
    expect(compareVersions('garbage', '0.1.0')).toBe(-1)
    expect(compareVersions('0.1.0', 'garbage')).toBe(1)
    expect(compareVersions('v1', 'v2')).toBe(-1)
  })
})

describe('isNewer', () => {
  it('only upgrades when the latest truly is newer', () => {
    expect(isNewer('0.1.0-rc.7', '0.1.0-rc.6')).toBe(true)
    expect(isNewer('0.1.0-rc.6', '0.1.0-rc.6')).toBe(false)
    expect(isNewer('0.1.0-rc.6', '0.1.0-rc.7')).toBe(false)
    expect(isNewer('', '0.1.0')).toBe(false)
    expect(isNewer('0.1.0', '')).toBe(false)
  })
})

describe('findProfileDir', () => {
  const manifests: Record<string, unknown> = {
    '/Users/u/.dsh/profiles/web/package.json': {
      name: 'dsh-profile-web',
      dsh: { profile: { bundles: [] } },
    },
    '/Users/u/.dsh/profiles/web/node_modules/@mrwinchester/dsh-version/lib/index.js': undefined,
  }
  const readJson = (path: string): unknown | undefined => manifests[path]

  it('walks up from a module file to the profile root', () => {
    expect(findProfileDir('/Users/u/.dsh/profiles/web/node_modules/@mrwinchester/dsh-version/lib/index.js', readJson))
      .toBe('/Users/u/.dsh/profiles/web')
  })

  it('returns undefined outside a profile tree', () => {
    expect(findProfileDir('/opt/app/lib/index.js', () => undefined)).toBeUndefined()
  })
})

describe('findProfilesByDependency', () => {
  const manifests: Record<string, unknown> = {
    '/Users/u/.dsh/profiles/web/package.json': {
      dependencies: { '@mrwinchester/dsh-version': 'link:/path/to/dsh-version-control' },
    },
    '/Users/u/.dsh/profiles/lite/package.json': {
      dependencies: { '@deepseek-ai/dsh': '0.1.0-rc.6' },
    },
    '/Users/u/.dsh/profiles/headless/package.json': {
      dependencies: { '@mrwinchester/dsh-version': 'link:...' },
    },
  }
  const readJson = (path: string): unknown | undefined => manifests[path]
  const listDirs = (root: string): string[] =>
    root === '/Users/u/.dsh/profiles' ? ['web', 'lite', 'headless', '.tmp'] : []

  it('returns every profile that depends on the plugin', () => {
    expect(findProfilesByDependency('/Users/u/.dsh/profiles', '@mrwinchester/dsh-version', readJson, listDirs))
      .toEqual(['/Users/u/.dsh/profiles/web', '/Users/u/.dsh/profiles/headless'])
  })

  it('returns an empty list when the plugin is not installed anywhere', () => {
    expect(findProfilesByDependency('/Users/u/.dsh/profiles', '@mrwinchester/dsh-ssh', readJson, listDirs)).toEqual([])
  })
})

describe('githubReleasesUrl', () => {
  it('points at the dsh releases endpoint with a per-page bound', () => {
    expect(githubReleasesUrl()).toBe('https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=10')
    expect(githubReleasesUrl(3)).toBe('https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=3')
  })
})

describe('releaseTagToVersion', () => {
  it('normalizes dsh release tags to versions', () => {
    expect(releaseTagToVersion('dsh-v0.1.0-rc.8')).toBe('0.1.0-rc.8')
    expect(releaseTagToVersion('v0.1.0-rc.7')).toBe('0.1.0-rc.7')
    expect(releaseTagToVersion('0.1.0')).toBe('0.1.0')
    expect(releaseTagToVersion('dsh-v1.2.3')).toBe('1.2.3')
  })

  it('rejects malformed and off-line values without throwing', () => {
    expect(releaseTagToVersion(undefined)).toBeUndefined()
    expect(releaseTagToVersion(42)).toBeUndefined()
    expect(releaseTagToVersion('')).toBeUndefined()
    expect(releaseTagToVersion('dsh-v0.1.0-rc.8x')).toBeUndefined()
    expect(releaseTagToVersion('latest')).toBeUndefined()
    expect(releaseTagToVersion('v1')).toBeUndefined()
  })
})

describe('pickNewestReleaseVersion', () => {
  const release = (tagName: string, draft = false): unknown => ({ tag_name: tagName, draft })

  it('returns the newest release regardless of response order', () => {
    expect(pickNewestReleaseVersion([release('dsh-v0.1.0-rc.6'), release('dsh-v0.1.0-rc.8'), release('dsh-v0.1.0-rc.7')]))
      .toBe('0.1.0-rc.8')
    expect(pickNewestReleaseVersion([release('dsh-v0.1.0-rc.8')])).toBe('0.1.0-rc.8')
  })

  it('skips drafts and unrecognizable entries, then falls back to the best parseable one', () => {
    expect(pickNewestReleaseVersion([release('dsh-v0.1.0-rc.8', true), release('dsh-v0.1.0-rc.7')])).toBe('0.1.0-rc.7')
    expect(pickNewestReleaseVersion([release('not-a-version'), release('dsh-v0.1.0-rc.5')])).toBe('0.1.0-rc.5')
    expect(pickNewestReleaseVersion([release('not-a-version')])).toBeUndefined()
  })

  it('returns undefined for non-array payloads', () => {
    expect(pickNewestReleaseVersion({})).toBeUndefined()
    expect(pickNewestReleaseVersion(null)).toBeUndefined()
    expect(pickNewestReleaseVersion(undefined)).toBeUndefined()
  })
})

describe('pickNpmDistTagVersion', () => {
  it('prefers the highest of latest/next, mirroring the rc release cadence', () => {
    expect(pickNpmDistTagVersion({ latest: '0.1.0-rc.7', next: '0.1.0-rc.8' })).toBe('0.1.0-rc.8')
    expect(pickNpmDistTagVersion({ latest: '0.1.0-rc.8', next: '0.1.0-rc.7' })).toBe('0.1.0-rc.8')
    expect(pickNpmDistTagVersion({ latest: '0.1.0-rc.7' })).toBe('0.1.0-rc.7')
  })

  it('skips off-line values and returns undefined for empty payloads', () => {
    expect(pickNpmDistTagVersion({ latest: '0.0.1-rc.1' })).toBe('0.0.1-rc.1')
    expect(pickNpmDistTagVersion({ beta: 'garbage', old: '0.0.1' })).toBe('0.0.1')
    expect(pickNpmDistTagVersion({})).toBeUndefined()
    expect(pickNpmDistTagVersion(null)).toBeUndefined()
  })
})