/**
 * The DSH 版本 panel: two big numbers — the local dsh core version and the
 * latest published version — a manual refresh, a two-step update, and one
 * line of schedule info. Polls the status route while mounted; the cadence
 * tightens to 1s while an update runs.
 */

import { useEffect, useState } from 'react'
import type { VersionApi } from '../api.ts'
import type { VersionStatus } from '../../protocol.ts'
import type { PanelController } from './controller.ts'
import { errorMessage, formatTime, isNewerVersion, tt } from './helpers.ts'
import css from './version.module.css'

/** Props for the version panel. */
export interface VersionPanelProps {
  /** The panel state owner (open/close/toggle). */
  controller: PanelController
  /** The version API client the panel operates through. */
  api: VersionApi
}

/** Poll cadence while an update runs (ms). */
const UPDATE_POLL_MS = 1_000
/** Poll cadence while idle (ms). */
const IDLE_POLL_MS = 15_000

/** The version panel view (mounted in the center column by mount.tsx). */
export function VersionPanel({ controller, api }: VersionPanelProps) {
  const [status, setStatus] = useState<VersionStatus | null>(null)
  const [error, setError] = useState('')
  const [confirmUpdate, setConfirmUpdate] = useState(false)

  const running = status?.update.state === 'running'

  const load = async (): Promise<void> => {
    try {
      setStatus(await api.status())
      setError('')
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, running ? UPDATE_POLL_MS : IDLE_POLL_MS)
    return () => { clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const handleRefresh = async (): Promise<void> => {
    try {
      await api.refresh()
      setError('')
    } catch (caught) {
      setError(errorMessage(caught))
    }
    void load()
  }

  const handleUpdate = async (): Promise<void> => {
    setConfirmUpdate(false)
    try {
      await api.update()
      setError('')
    } catch (caught) {
      setError(errorMessage(caught))
    }
    void load()
  }

  const local = status?.localVersion ?? ''
  const latest = status?.latestVersion ?? ''
  const outOfDate = isNewerVersion(latest, local)
  const upToDate = local !== '' && latest !== '' && !outOfDate
  const statusText = status === null
    ? ''
    : status.checking
      ? tt('checking')
      : outOfDate
        ? tt('status.outOfDate')
        : upToDate
          ? tt('status.upToDate')
          : tt('status.unknown')
  const statusKind = status !== null && status.checking
    ? 'checking'
    : outOfDate
      ? 'update'
      : upToDate
        ? 'ok'
        : 'unknown'
  const update = status?.update
  // The update button is only actionable when an upgrade actually exists:
  // both versions are known and the latest is genuinely newer.
  const profileUpdatable = status !== null && status.profileUpdatable
  const updateAvailable = profileUpdatable && !running && local !== '' && latest !== '' && isNewerVersion(latest, local)
  const updaterUnavailable = !profileUpdatable

  return (
    <div className={css.panel}>
      <header className={css.panelHeader}>
        <h2 className={css.panelTitle}>{tt('panel.title')}</h2>
        <button className={css.linkButton} onClick={() => controller.close()}>{tt('panel.backToConversation')}</button>
      </header>

      {error !== '' && <div className={css.banner} data-kind="error">{tt('common.error', { error })}</div>}

      {status === null && <div className={css.loading}>{tt('common.loading')}</div>}

      {status !== null && (
        <>
          <section className={css.cards}>
            <div className={css.card}>
              <div className={css.cardLabel}>{tt('local.label')}</div>
              <div className={css.cardValue}>{local !== '' ? local : tt('status.unknown')}</div>
              <div className={css.cardHint}>{tt('local.hint')}</div>
              <span className={css.badge} data-status={statusKind}>{statusText}</span>
            </div>
            <div className={css.card}>
              <div className={css.cardLabel}>{tt('latest.label')}</div>
              <div className={css.cardValue}>{latest !== '' ? latest : (status.checking ? '…' : '--')}</div>
              <div className={css.cardHint}>{tt('latest.hint')}</div>
            </div>
          </section>

          <div className={css.toolbar}>
            <button className={css.ghostButton} onClick={() => void handleRefresh()} disabled={status.checking}>
              {status.checking ? tt('checking') : tt('toolbar.refresh')}
            </button>
            <button
              className={css.primaryButton}
              onClick={() => { if (confirmUpdate) void handleUpdate(); else setConfirmUpdate(true) }}
              disabled={!updateAvailable}
              title={!updateAvailable ? tt('toolbar.updateDisabledHint') : undefined}
            >
              {running ? tt('toolbar.updating') : confirmUpdate ? tt('toolbar.updateConfirm') : tt('toolbar.update')}
            </button>
            <span className={css.toolbarSpacer} />
          </div>

          {confirmUpdate && !running && (
            <div className={css.banner} data-kind="info">{tt('summary.profileDir', { dir: status.profileDir })} — {tt('toolbar.updateConfirm')}</div>
          )}
          {updaterUnavailable && <div className={css.hint}>{tt('summary.noProfile')}</div>}

          {update?.state === 'success' && <div className={css.banner} data-kind="ok">{tt('update.done')}</div>}
          {update?.state === 'failed' && (
            <div className={css.banner} data-kind="error">
              {update.error !== undefined ? tt('update.failed', { error: update.error }) : tt('update.failed', { error: '--' })}
            </div>
          )}

          <footer className={css.footer}>
            <span>{status.lastCheckedAt === undefined ? tt('summary.neverChecked') : tt('summary.lastChecked', { time: formatTime(status.lastCheckedAt) })}</span>
            {status.profileUpdatable
              ? <span>{tt('summary.interval', { minutes: status.checkIntervalMinutes })}</span>
              : <span>{tt('summary.intervalOff')}</span>}
            <span className={css.footerHint}>{tt('summary.intervalHint')}</span>
          </footer>
        </>
      )}
    </div>
  )
}