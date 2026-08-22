/**
 * Sidebar entry injection.
 *
 * The shell exposes no slot an external plugin can register into, so the
 * entry row is injected at the DOM level, following the task-board / ssh
 * precedent. The row lands after the family block (task board, ssh) so all
 * injected entries keep a stable relative order; the injection self-heals:
 * a MutationObserver watches the sidebar root and re-inserts the row whenever
 * a React re-render displaces it (re-insertion happens in the same frame,
 * before paint, so no flicker).
 */
import type { PanelController } from './panel/controller.ts'
import { tt } from './panel/helpers.ts'
import css from './panel/version.module.css'

/** Stable data attribute identifying the injected entry row. */
export const ENTRY_SELECTOR = '[data-dsh-version-entry]'

/** Inline icon (matches the shell's 16px nav-icon look): a version tag. */
const ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l5.828 5.828a2 2 0 0 0 2.828 0l4.172-4.172a2 2 0 0 0 0-2.828z"/><circle cx="7" cy="7" r="0.6" fill="currentColor" stroke="none"/></svg>'

/** Find the sidebar shell root element, or undefined while not yet mounted. */
function sidebarRoot(): HTMLElement | undefined {
  const column = document.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
  if (column === null) return undefined
  const logoOwner = column.querySelector<HTMLElement>('[class*="logoRow"]')?.parentElement
  return logoOwner ?? (column.firstElementChild as HTMLElement | undefined)
}

/** The New Session button: nested in the logo row on current shells, a direct child on legacy shells. */
function newSessionButton(root: HTMLElement): HTMLButtonElement | undefined {
  const nested = root.querySelector<HTMLButtonElement>('button[class*="newSession"]')
  if (nested !== null) return nested
  for (const child of root.children) {
    if (child.tagName === 'BUTTON') return child as HTMLButtonElement
  }
  return undefined
}

/** Build the entry row (a detached button; insert once the shell is up). */
function createEntry(controller: PanelController): HTMLButtonElement {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.dataset.dshVersionEntry = ''
  entry.className = css.entry
  entry.setAttribute('aria-label', tt('entry.label'))
  entry.setAttribute('title', tt('entry.tooltip'))
  entry.innerHTML = '<span class="' + css.entryIcon + '">' + ICON + '</span><span class="' + css.entryLabel + '">' + tt('entry.label') + '</span>'
  entry.addEventListener('click', () => { controller.toggle() })
  return entry
}

/** The injected family block selectors (every DOM-level sidebar plugin). */
const FAMILY_SELECTORS = '[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-version-entry]'

/** Re-insert the entry after the whole family block (or after New Session). */
function placeEntry(root: HTMLElement, entry: HTMLButtonElement): boolean {
  const button = newSessionButton(root)
  if (button === undefined) return false
  if (entry.parentElement !== root) {
    const row = button.closest('[class*="logoRow"]')
    const base = (row !== null && row.parentElement === root) ? row : button
    const family = Array.from(root.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.matches(FAMILY_SELECTORS),
    )
    const anchor = family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling
    root.insertBefore(entry, anchor)
  }
  return true
}

/**
 * Mount the sidebar entry, waiting for the shell to render and self-healing
 * on later React re-renders.
 * @param controller - the panel controller the entry toggles.
 * @returns disposer removing the entry and its observers.
 */
export function mountSidebarEntry(controller: PanelController): () => void {
  const entry = createEntry(controller)
  let root: HTMLElement | undefined
  let placed = false

  const tryPlace = (): void => {
    if (root !== undefined && !root.isConnected) {
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    if (placed) {
      if (document.body.contains(entry)) return
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    root ??= sidebarRoot()
    if (root === undefined) return
    placed = placeEntry(root, entry)
    if (placed) {
      rootObserver.observe(root, { childList: true, subtree: true })
    }
  }

  const waitObserver = new MutationObserver(() => { tryPlace() })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  const rootObserver = new MutationObserver(() => {
    if (root === undefined || !root.isConnected) {
      placed = false
      tryPlace()
      return
    }
    if (!root.contains(entry)) {
      placed = placeEntry(root, entry)
    }
  })

  const syncActive = () => {
    if (controller.getSnapshot().panelOpen) entry.dataset.active = 'true'
    else delete entry.dataset.active
  }
  const unsubscribe = controller.subscribe(syncActive)
  syncActive()

  tryPlace()

  return () => {
    waitObserver.disconnect()
    rootObserver.disconnect()
    unsubscribe()
    entry.remove()
  }
}