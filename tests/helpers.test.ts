import { describe, expect, it } from 'vitest'
import { compareVersion, isNewerVersion } from '../src/client/panel/helpers.ts'

describe('compareVersion (client-side comparator)', () => {
  it('orders the dsh release line like the host comparator', () => {
    expect(compareVersion('0.1.0-rc.6', '0.1.0-rc.7')).toBe(-1)
    expect(compareVersion('0.1.0-rc.7', '0.1.0-rc.6')).toBe(1)
    expect(compareVersion('0.1.0-rc.7', '0.1.0-rc.7')).toBe(0)
    expect(compareVersion('0.1.0', '0.1.0-rc.7')).toBe(1)
    expect(compareVersion('0.2.0', '0.1.20')).toBe(1)
  })

  it('sorts malformed versions below well-formed ones', () => {
    expect(compareVersion('garbage', '0.1.0')).toBe(-1)
    expect(compareVersion('0.1.0', 'garbage')).toBe(1)
  })
})

describe('isNewerVersion', () => {
  it('only flags a genuine upgrade', () => {
    expect(isNewerVersion('0.1.0-rc.7', '0.1.0-rc.6')).toBe(true)
    expect(isNewerVersion('0.1.0-rc.6', '0.1.0-rc.6')).toBe(false)
    expect(isNewerVersion('0.1.0-rc.6', '0.1.0-rc.7')).toBe(false)
    expect(isNewerVersion('', '0.1.0')).toBe(false)
    expect(isNewerVersion('0.1.0', '')).toBe(false)
  })
})