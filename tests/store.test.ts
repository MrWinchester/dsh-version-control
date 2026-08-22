import { describe, expect, it } from 'vitest'
import { VersionStore } from '../src/store.ts'

/** Build a store with injected dependencies. */
function makeStore(overrides: Partial<ConstructorParameters<typeof VersionStore>[0]> = {}): VersionStore {
  return new VersionStore({
    probeLocal: () => '0.1.0-rc.6',
    fetchLatest: async () => '0.1.0-rc.7',
    runUpdate: async () => 0,
    profileDir: '/Users/u/.dsh/profiles/web',
    profileUpdatable: true,
    ...overrides,
  })
}

/** Wait out the immediate async check / update. */
function settle(ms = 20): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('VersionStore', () => {
  it('reports local and latest versions after a refresh', async () => {
    const store = makeStore()
    store.refresh()
    await settle()
    const status = store.status()
    expect(status.checking).toBe(false)
    expect(status.lastCheckedAt).toBeDefined()
    expect(status.localVersion).toBe('0.1.0-rc.6')
    expect(status.latestVersion).toBe('0.1.0-rc.7')
    expect(status.profileDir).toBe('/Users/u/.dsh/profiles/web')
    expect(status.checkIntervalMinutes).toBe(0)
    store.dispose()
  })

  it('keeps the previous registry value on a fetch failure', async () => {
    let fail = true
    const store = makeStore({
      fetchLatest: async () => {
        if (fail) throw new Error('registry 500')
        return '0.1.0-rc.7'
      },
    })
    store.refresh()
    await settle()
    expect(store.status().latestVersion).toBe('')

    fail = false
    store.refresh()
    await settle()
    const status = store.status()
    expect(status.latestVersion).toBe('0.1.0-rc.7')
    store.dispose()
  })

  it('records the interval when started', async () => {
    const store = makeStore()
    store.start(180)
    await settle()
    expect(store.status().checkIntervalMinutes).toBe(180)
    store.dispose()
  })

  it('runs the update and reports success', async () => {
    const store = makeStore()
    store.refresh()
    await settle()
    store.update()
    expect(store.status().update.state).toBe('running')
    await settle()
    expect(store.status().update.state).toBe('success')
    store.dispose()
  })

  it('pins all three core packages to the checked latest version', async () => {
    let specsSeen: readonly string[] | undefined
    const store = makeStore({
      runUpdate: async specs => { specsSeen = specs; return 0 },
    })
    store.refresh()
    await settle()
    store.update()
    await settle()
    expect(specsSeen).toEqual([
      '@deepseek-ai/dsh@0.1.0-rc.7',
      '@deepseek-ai/dsh-base@0.1.0-rc.7',
      '@deepseek-ai/dsh-web-app@0.1.0-rc.7',
    ])
    store.dispose()
  })

  it('refuses to update before any registry check', () => {
    const store = makeStore()
    expect(() => store.update()).toThrow('尚未取得最新版本号')
    store.dispose()
  })

  it('rejects a second update while running', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    const store = makeStore({
      runUpdate: () => gate.then(() => 0),
    })
    store.refresh()
    await settle()
    store.update()
    expect(() => store.update()).toThrow('更新已在运行中')
    release()
    await settle()
    store.dispose()
  })

  it('marks a failing exit code as failed', async () => {
    const store = makeStore({
      runUpdate: async () => 1,
    })
    store.refresh()
    await settle()
    store.update()
    await settle()
    const update = store.status().update
    expect(update.state).toBe('failed')
    expect(update.error).toContain('退出码 1')
    store.dispose()
  })

  it('refuses to update without a profile', () => {
    const store = makeStore({ profileUpdatable: false, profileDir: '' })
    expect(() => store.update()).toThrow('未检测到可更新的 profile')
    store.dispose()
  })
})