/**
 * The /api/dsh-version route family: status snapshot, manual registry
 * refresh, and the update kicker. Every route carries the loopback-only
 * trust fence — the update endpoint runs a package install in the profile
 * directory, so LAN-exposed dsh web deployments must not serve it.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from './loopback.ts'
import { VERSION_API, type ApiErrorBody } from './protocol.ts'
import type { VersionStoreLike } from './store.ts'

/** One JSON response. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(payload)
}

/** Method + loopback fence. */
function guard(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (req.method !== method) {
    writeJson(res, 405, { error: `expected ${method}` } satisfies ApiErrorBody)
    return false
  }
  if (!isLoopbackRequest(req)) {
    writeJson(res, 403, { error: 'loopback requests only' } satisfies ApiErrorBody)
    return false
  }
  return true
}

/**
 * Build the version route family.
 * @param store - the version capability's state owner.
 * @returns the routes to register with `ctx.webServer`.
 */
export function makeRoutes(store: VersionStoreLike): WebRoute[] {
  return [
    {
      kind: 'exact',
      path: VERSION_API.status,
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        writeJson(res, 200, store.status())
      },
    },
    {
      kind: 'exact',
      path: VERSION_API.refresh,
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        store.refresh()
        writeJson(res, 200, { ok: true })
      },
    },
    {
      kind: 'exact',
      path: VERSION_API.update,
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        try {
          store.update()
          writeJson(res, 200, { ok: true })
        } catch (error) {
          writeJson(res, 409, { error: error instanceof Error ? error.message : String(error) } satisfies ApiErrorBody)
        }
      },
    },
  ]
}