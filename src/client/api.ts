/**
 * Browser-side API client for the /api/dsh-version route family. The only
 * data access path the panel uses — plain fetch, same origin.
 */

import { VERSION_API, type ApiErrorBody, type VersionStatus } from '../protocol.ts'

/** Error carrying the route's JSON error message. */
export class VersionApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VersionApiError'
  }
}

/** Parse a JSON response or throw a VersionApiError. */
async function readJson<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new VersionApiError(`HTTP ${response.status}: invalid JSON response`)
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && typeof (body as ApiErrorBody).error === 'string'
      ? (body as ApiErrorBody).error
      : `HTTP ${response.status}`
    throw new VersionApiError(message)
  }
  return body as T
}

/** The browser half's only data entry point. */
export class VersionApi {
  async status(): Promise<VersionStatus> {
    const response = await fetch(VERSION_API.status)
    return readJson<VersionStatus>(response)
  }

  async refresh(): Promise<void> {
    const response = await fetch(VERSION_API.refresh, { method: 'POST' })
    await readJson<{ ok: boolean }>(response)
  }

  async update(): Promise<void> {
    const response = await fetch(VERSION_API.update, { method: 'POST' })
    await readJson<{ ok: boolean }>(response)
  }
}