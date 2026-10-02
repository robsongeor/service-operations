import { Buffer } from 'node:buffer'

const LIVE_ORIGIN = 'https://yellow-cliff-068680700.7.azurestaticapps.net'
const GUID = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}'
const REVIEW_PATH = new RegExp(`^/api/jobcardreviews(?:/${GUID}){0,2}$`, 'i')
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024

function json(response, status, error) {
    response.statusCode = status
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'private, no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.end(JSON.stringify({ error }))
}

// This opt-in development middleware never receives Azure keys, persists tokens or forwards writes.
export function createJobCardReadOnlyMiddleware(fetchImpl = globalThis.fetch) {
    return async (request, response, next) => {
        const url = new URL(request.url || '/', 'http://localhost')
        if (!/^\/api\/jobcardreviews(?:\/|$)/i.test(url.pathname)) return next()
        response.setHeader('X-Job-Card-Data-Source', 'live-read-only')
        if (request.method !== 'GET') {
            response.setHeader('Allow', 'GET')
            return json(response, 405, 'Local Job Card access is read-only. Review updates and email retries are disabled.')
        }
        if (url.origin !== 'http://localhost' || !REVIEW_PATH.test(url.pathname)) return json(response, 400, 'Invalid Job Card review path.')
        const authorization = request.headers['x-dataverse-authorization']
        if (typeof authorization !== 'string' || !/^Bearer\s+\S+$/i.test(authorization)) return json(response, 401, 'Microsoft authentication is required.')

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 25_000)
        const abort = () => controller.abort()
        request.on('aborted', abort)
        response.on('close', abort)
        try {
            const upstream = await fetchImpl(`${LIVE_ORIGIN}${url.pathname}${url.search}`, {
                method: 'GET', redirect: 'error', cache: 'no-store', signal: controller.signal,
                // Deliberately do not forward cookies, server credentials, Origin or arbitrary headers.
                headers: { 'X-Dataverse-Authorization': authorization, Accept: '*/*' },
            })
            if (upstream.status >= 300 && upstream.status < 400) throw new Error('Redirects are not allowed.')
            if (Number(upstream.headers.get('content-length')) > MAX_RESPONSE_BYTES) throw new Error('Response exceeds limit.')
            const chunks = []
            let size = 0
            if (upstream.body) {
                const reader = upstream.body.getReader()
                try {
                    while (true) {
                        const { done, value } = await reader.read()
                        if (done) break
                        size += value.byteLength
                        if (size > MAX_RESPONSE_BYTES) throw new Error('Response exceeds limit.')
                        chunks.push(Buffer.from(value))
                    }
                } finally { await reader.cancel().catch(() => {}) }
            }
            if (response.destroyed) return
            response.statusCode = upstream.status
            for (const name of ['content-type', 'content-disposition', 'www-authenticate']) {
                const value = upstream.headers.get(name)
                if (value) response.setHeader(name, value)
            }
            response.setHeader('Cache-Control', 'private, no-store')
            response.setHeader('X-Content-Type-Options', 'nosniff')
            response.end(Buffer.concat(chunks))
        } catch {
            controller.abort()
            if (!response.destroyed) json(response, 502, 'The live Job Card service could not be reached. Check the local server connection and try again.')
        } finally {
            clearTimeout(timeout)
            request.off('aborted', abort)
            response.off('close', abort)
        }
    }
}

export default function jobCardReadOnlyProxy() {
    return {
        name: 'local-job-card-live-read-only', enforce: 'pre', apply: 'serve',
        config: () => ({ define: { 'import.meta.env.VITE_JOB_CARD_READ_ONLY': JSON.stringify('true') } }),
        configureServer(server) { server.middlewares.use(createJobCardReadOnlyMiddleware()) },
    }
}
