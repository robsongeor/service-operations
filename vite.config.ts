import type { IncomingMessage, ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)
const jobSubmissionService = require('./api/services/jobSubmissionService') as {
  generate: (request: LocalFunctionRequest) => Promise<LocalFunctionResponse>
  handlePublicGet: (request: LocalFunctionRequest) => Promise<LocalFunctionResponse>
  handlePublicPost: (request: LocalFunctionRequest) => Promise<LocalFunctionResponse>
  jsonResponse: (status: number, body: object, headers?: Record<string, string>) => LocalFunctionResponse
}
const siteCheckAssignmentService = require('./api/services/siteCheckAssignmentService') as {
  generate: (request: LocalFunctionRequest) => Promise<LocalFunctionResponse>
  revoke: (request: LocalFunctionRequest) => Promise<LocalFunctionResponse>
  handlePublicGet: (request: LocalFunctionRequest) => Promise<LocalFunctionResponse>
  jsonResponse: (status: number, body: object, headers?: Record<string, string>) => LocalFunctionResponse
}

const LIFTTRUCKS_API_ORIGIN = 'https://webview.liftrucks.co.nz'
const LIFTTRUCKS_API_KEY = '500256'
const LIFTTRUCKS_TIMEOUT_MS = 15_000

function sendJson(response: ServerResponse, statusCode: number, body: object) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

type LocalFunctionRequest = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, string>
  body?: Record<string, unknown>
}

type LocalFunctionResponse = {
  status: number
  headers?: Record<string, string>
  body?: string
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function sendFunctionResponse(response: ServerResponse, result: LocalFunctionResponse) {
  response.statusCode = result.status
  Object.entries(result.headers ?? {}).forEach(([name, value]) => response.setHeader(name, value))
  response.end(result.body ?? '')
}

function jobSubmissionProxy(env: Record<string, string | undefined>): Plugin {
  process.env.DATAVERSE_URL ||= env.DATAVERSE_URL || env.VITE_DATAVERSE_URL
  process.env.DATAVERSE_TENANT_ID ||= env.DATAVERSE_TENANT_ID || env.VITE_MSAL_TENANT_ID
  process.env.DATAVERSE_CLIENT_ID ||= env.DATAVERSE_CLIENT_ID
  process.env.DATAVERSE_CLIENT_SECRET ||= env.DATAVERSE_CLIENT_SECRET

  const installMiddleware = (middlewares: { use: (handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => void) => void }) => {
    middlewares.use((request, response, next) => {
      if (!request.url) return next()
      const requestUrl = new URL(request.url, 'http://localhost')
      if (requestUrl.pathname !== '/api/jobsubmission') return next()

      void (async () => {
        try {
          const body = request.method === 'POST' ? await readJsonBody(request) : {}
          if (body === null) {
            return sendFunctionResponse(response, jobSubmissionService.jsonResponse(400, { error: 'The request body is invalid.' }))
          }
          const localRequest: LocalFunctionRequest = {
            method: request.method,
            headers: request.headers,
            query: Object.fromEntries(requestUrl.searchParams),
            body,
          }
          let result: LocalFunctionResponse
          if (request.method === 'GET') result = await jobSubmissionService.handlePublicGet(localRequest)
          else if (request.method === 'POST' && body.action === 'generate') result = await jobSubmissionService.generate(localRequest)
          else if (request.method === 'POST') result = await jobSubmissionService.handlePublicPost(localRequest)
          else result = jobSubmissionService.jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' })
          sendFunctionResponse(response, result)
        } catch {
          sendFunctionResponse(response, jobSubmissionService.jsonResponse(503, {
            code: 'temporary',
            error: 'The job card service is temporarily unavailable.',
          }))
        }
      })()
    })
  }
  return {
    name: 'job-submission-api-proxy',
    configureServer(server) {
      installMiddleware(server.middlewares)
    },
    configurePreviewServer(server) {
      installMiddleware(server.middlewares)
    },
  }
}

function siteCheckAssignmentProxy(env: Record<string, string | undefined>): Plugin {
  process.env.DATAVERSE_URL ||= env.DATAVERSE_URL || env.VITE_DATAVERSE_URL
  process.env.DATAVERSE_TENANT_ID ||= env.DATAVERSE_TENANT_ID || env.VITE_MSAL_TENANT_ID
  process.env.DATAVERSE_CLIENT_ID ||= env.DATAVERSE_CLIENT_ID
  process.env.DATAVERSE_CLIENT_SECRET ||= env.DATAVERSE_CLIENT_SECRET

  const installMiddleware = (middlewares: { use: (handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => void) => void }) => {
    middlewares.use((request, response, next) => {
      if (!request.url) return next()
      const requestUrl = new URL(request.url, 'http://localhost')
      if (requestUrl.pathname !== '/api/sitecheckassignment') return next()

      void (async () => {
        try {
          const body = request.method === 'POST' ? await readJsonBody(request) : {}
          if (body === null) {
            return sendFunctionResponse(response, siteCheckAssignmentService.jsonResponse(400, { error: 'The request body is invalid.' }))
          }
          const localRequest: LocalFunctionRequest = {
            method: request.method,
            headers: request.headers,
            query: Object.fromEntries(requestUrl.searchParams),
            body,
          }
          let result: LocalFunctionResponse
          if (request.method === 'GET') result = await siteCheckAssignmentService.handlePublicGet(localRequest)
          else if (request.method === 'POST' && body.action === 'generate') result = await siteCheckAssignmentService.generate(localRequest)
          else if (request.method === 'POST' && body.action === 'revoke') result = await siteCheckAssignmentService.revoke(localRequest)
          else result = siteCheckAssignmentService.jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' })
          sendFunctionResponse(response, result)
        } catch {
          sendFunctionResponse(response, siteCheckAssignmentService.jsonResponse(503, {
            code: 'temporary',
            error: 'The Site Check assignment service is temporarily unavailable.',
          }))
        }
      })()
    })
  }
  return {
    name: 'site-check-assignment-api-proxy',
    configureServer(server) {
      installMiddleware(server.middlewares)
    },
    configurePreviewServer(server) {
      installMiddleware(server.middlewares)
    },
  }
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
    plugins: [react(), liftTrucksProxy(env), jobSubmissionProxy(env), siteCheckAssignmentProxy(env)],
  }
})
