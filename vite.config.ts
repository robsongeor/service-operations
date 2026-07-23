import type { IncomingMessage, ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const LIFTTRUCKS_API_ORIGIN = 'https://webview.liftrucks.co.nz'
const LIFTTRUCKS_API_KEY = '500256'
const LIFTTRUCKS_TIMEOUT_MS = 15_000

function sendJson(response: ServerResponse, statusCode: number, body: object) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

function liftTrucksProxy(env: Record<string, string | undefined>): Plugin {
  const validateAuthenticatedUser = async (request: IncomingMessage, response: ServerResponse) => {
    const authorization = request.headers.authorization?.trim() ?? ''
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
      response.setHeader('WWW-Authenticate', 'Bearer')
      sendJson(response, 401, { error: 'Authentication is required.' })
      return false
    }

    const configuredOrigin = env.DATAVERSE_URL || env.VITE_DATAVERSE_URL
    let dataverseOrigin = ''
    try {
      const url = new URL(configuredOrigin ?? '')
      if (url.protocol === 'https:') dataverseOrigin = url.origin
    } catch {
      // Invalid configuration is handled without exposing server settings.
    }
    if (!dataverseOrigin) {
      sendJson(response, 500, { error: 'Authentication validation is not configured.' })
      return false
    }

    try {
      const identityResponse = await fetch(`${dataverseOrigin}/api/data/v9.2/WhoAmI`, {
        headers: { Authorization: authorization, Accept: 'application/json' },
      })
      if (!identityResponse.ok) {
        if (identityResponse.status === 401 || identityResponse.status === 403) {
          response.setHeader('WWW-Authenticate', 'Bearer')
          sendJson(response, 401, { error: 'The authenticated session is invalid or expired.' })
        } else {
          sendJson(response, 503, { error: 'Authentication could not be validated.' })
        }
        return false
      }
      const identity = await identityResponse.json() as { UserId?: unknown }
      if (typeof identity.UserId !== 'string' || !identity.UserId) {
        sendJson(response, 401, { error: 'The authenticated identity is invalid.' })
        return false
      }
    } catch {
      sendJson(response, 503, { error: 'Authentication could not be validated.' })
      return false
    }

    return true
  }

  const handleRequest = async (request: IncomingMessage, response: ServerResponse) => {
    if (!request.url) return false

    const requestUrl = new URL(request.url, 'http://localhost')
    if (requestUrl.pathname !== '/api/joblookup') return false

    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET')
      sendJson(response, 405, { error: 'Method not allowed.' })
      return true
    }

    if (!await validateAuthenticatedUser(request, response)) return true

    const jobNumber = requestUrl.searchParams.get('jobNumber')?.trim() ?? ''
    if (!jobNumber) {
      response.setHeader('X-Job-Lookup-Source', 'internal-proxy')
      sendJson(response, 400, { error: 'Job Number is required.' })
      return true
    }
    if (jobNumber.length > 100 || !/^[A-Za-z0-9._-]+$/.test(jobNumber)) {
      response.setHeader('X-Job-Lookup-Source', 'internal-proxy')
      sendJson(response, 400, { error: 'Job Number is invalid.' })
      return true
    }

    const username = env.LIFTTRUCKS_API_USERNAME
    const password = env.LIFTTRUCKS_API_PASSWORD
    if (!username || !password) {
      response.setHeader('X-Job-Lookup-Source', 'internal-proxy')
      sendJson(response, 500, {
        error: 'Lift Trucks API credentials are not configured on the server.',
      })
      return true
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LIFTTRUCKS_TIMEOUT_MS)

    try {
      const upstreamUrl = new URL(`/api/01/JCJob/${encodeURIComponent(jobNumber)}`, LIFTTRUCKS_API_ORIGIN)
      upstreamUrl.searchParams.set('page', '1')
      upstreamUrl.searchParams.set('pageSize', '50')
      upstreamUrl.searchParams.set('ApiKey', LIFTTRUCKS_API_KEY)

      const upstreamResponse = await fetch(upstreamUrl, {
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
        },
        signal: controller.signal,
      })

      if (!upstreamResponse.ok) {
        response.setHeader('X-Job-Lookup-Source', 'upstream-service')
        sendJson(response, 502, { error: 'The Lift Trucks API could not complete the request.' })
        return true
      }

      response.statusCode = 200
      response.setHeader('X-Job-Lookup-Source', 'upstream-service')
      const contentType = upstreamResponse.headers.get('content-type')
      if (contentType) response.setHeader('Content-Type', contentType)
      response.end(Buffer.from(await upstreamResponse.arrayBuffer()))
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        response.setHeader('X-Job-Lookup-Source', 'internal-proxy')
        sendJson(response, 504, { error: 'The Lift Trucks API request timed out.' })
      } else {
        response.setHeader('X-Job-Lookup-Source', 'internal-proxy')
        sendJson(response, 502, { error: 'The Lift Trucks API could not be reached.' })
      }
    } finally {
      clearTimeout(timeout)
    }

    return true
  }

  const installMiddleware = (middlewares: { use: (handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => void) => void }) => {
    middlewares.use((request, response, next) => {
      void handleRequest(request, response).then((handled) => {
        if (!handled) next()
      }).catch((error: unknown) => {
        void error
        sendJson(response, 500, { error: 'The Lift Trucks proxy could not process the request.' })
      })
    })
  }

  return {
    name: 'lifttrucks-api-proxy',
    configureServer(server) {
      installMiddleware(server.middlewares)
    },
    configurePreviewServer(server) {
      installMiddleware(server.middlewares)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, import.meta.dirname, ''), ...process.env }

  return {
    root: import.meta.dirname,
    plugins: [react(), liftTrucksProxy(env)],
  }
})
