/**
 * Invariant companion plugin: load-time coverage assertion between the
 * tracked display package and the update targets, plus a no-op apply for the
 * harness's invariant surface (nothing further to check at runtime).
 */

import { CORE_UPDATE_TARGETS, TRACKED_PACKAGE } from './store.ts'

/**
 * The displayed package must be among the update targets — otherwise the
 * panel would report a version the 更新 button does not bump.
 */
export function invariantRegistryCoverage(): void {
  if (!CORE_UPDATE_TARGETS.includes(TRACKED_PACKAGE)) {
    throw new Error(`dsh-version invariant: tracked package ${TRACKED_PACKAGE} is not in the update targets ${CORE_UPDATE_TARGETS.join(', ')}`)
  }
}

/** Provides the invariant registration — no runtime assertions to run. */
export function apply(): void {}