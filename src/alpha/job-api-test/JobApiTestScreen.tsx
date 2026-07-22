import { type FormEvent, useState } from 'react'
import './JobApiTestScreen.css'

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function displayValue(value: unknown) {
    if (value == null || value === '') return 'Not provided'
    if (typeof value === 'object') return JSON.stringify(value, null, 2)
    return String(value)
}

type RequestDiagnostics = {
    endpoint: string
    status: string
    source: string
    body: string
}

export default function JobApiTestScreen() {
    const [jobNumber, setJobNumber] = useState('')
    const [jobCards, setJobCards] = useState<Record<string, unknown>[]>([])
    const [message, setMessage] = useState('Enter a Job Number to view its job card.')
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [diagnostics, setDiagnostics] = useState<RequestDiagnostics | null>(null)

    const search = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const trimmedJobNumber = jobNumber.trim()

        if (!trimmedJobNumber) {
            setError('Enter a Job Number.')
            setJobCards([])
            setMessage('No request sent.')
            setDiagnostics(null)
            return
        }

        setIsLoading(true)
        setError('')
        setJobCards([])
        setMessage('')
        setDiagnostics(null)

        const endpoint = `/api/joblookup?${new URLSearchParams({ jobNumber: trimmedJobNumber })}`

        try {
            const apiResponse = await fetch(endpoint)
            const body = await apiResponse.text()
            const responseSource = apiResponse.headers.get('x-job-lookup-source') || 'internal endpoint'

            if (!apiResponse.ok) {
                setError(`${apiResponse.status} ${apiResponse.statusText || 'Request failed'}`)
                setMessage(body || 'The API returned an empty error response.')
                setDiagnostics({
                    endpoint,
                    status: `${apiResponse.status} ${apiResponse.statusText || ''}`.trim(),
                    source: responseSource,
                    body: body || '(empty response body)',
                })
                return
            }

            let result: unknown
            try {
                result = JSON.parse(body)
            } catch {
                setError('Invalid proxy response')
                setMessage('The endpoint returned a successful response that was not valid JSON.')
                setDiagnostics({ endpoint, status: `${apiResponse.status} ${apiResponse.statusText}`.trim(), source: responseSource, body })
                return
            }
            const records = Array.isArray(result) ? result : [result]
            const returnedJobCards = records.flatMap((record) => {
                if (!isRecord(record) || !isRecord(record.JCJob) || !isRecord(record.JCJob.JCJobCard)) {
                    return []
                }
                return [record.JCJob.JCJobCard]
            })

            setJobCards(returnedJobCards)
            if (returnedJobCards.length === 0) {
                setMessage('No JCJobCard was returned for this Job Number.')
            }
        } catch (requestError) {
            const message = requestError instanceof Error ? requestError.message : String(requestError)
            setError('Network failure')
            setMessage(`The proxy endpoint could not be reached. ${message}`)
            setDiagnostics({ endpoint, status: 'No HTTP response', source: 'internal endpoint', body: message })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <main className="job-api-test-page">
            <header className="job-api-test-header">
                <div>
                    <span>Temporary developer tool</span>
                    <h1>Job API Test</h1>
                </div>
            </header>

            <section className="job-api-test-card">
                <form onSubmit={(event) => void search(event)}>
                    <label htmlFor="job-api-test-number">Job Number</label>
                    <div className="job-api-test-controls">
                        <input
                            id="job-api-test-number"
                            autoComplete="off"
                            autoFocus
                            value={jobNumber}
                            onChange={(event) => {
                                setJobNumber(event.target.value)
                                if (error) setError('')
                            }}
                        />
                        <button type="submit" disabled={isLoading}>
                            {isLoading ? 'Searching...' : 'Search'}
                        </button>
                    </div>
                </form>

                <hr />

                <div className="job-api-test-response-heading">
                    <h2>JCJobCard</h2>
                    {error && <p role="alert">{error}</p>}
                </div>
                <div className="job-api-test-results" aria-live="polite">
                    {isLoading ? (
                        <div className="job-api-test-state"><span className="job-api-test-spinner" />Searching...</div>
                    ) : jobCards.length > 0 ? jobCards.map((jobCard, index) => {
                        const extraFields = Object.entries(jobCard).filter(([key]) =>
                            !['ReportFormat', 'TaskText', 'ActualText'].includes(key),
                        )

                        return (
                            <article className="job-card-result" key={index}>
                                <header>
                                    <div>
                                        <span>Lift Trucks API</span>
                                        <h3>Job card details</h3>
                                    </div>
                                    <span className="job-card-format">{displayValue(jobCard.ReportFormat)}</span>
                                </header>

                                <div className="job-card-copy-grid">
                                    <section>
                                        <span>Task</span>
                                        <h4>Work required</h4>
                                        <p>{displayValue(jobCard.TaskText)}</p>
                                    </section>
                                    <section>
                                        <span>Actual</span>
                                        <h4>Work completed</h4>
                                        <p>{displayValue(jobCard.ActualText)}</p>
                                    </section>
                                </div>

                                {extraFields.length > 0 && (
                                    <dl className="job-card-extra-fields">
                                        {extraFields.map(([key, value]) => (
                                            <div key={key}>
                                                <dt>{key}</dt>
                                                <dd>{displayValue(value)}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                )}
                            </article>
                        )
                    }) : (
                        <div className={error ? 'job-api-test-state error' : 'job-api-test-state'}>{message}</div>
                    )}
                </div>
                {diagnostics && (
                    <section className="job-api-test-diagnostics" aria-label="Request diagnostics">
                        <h3>Request diagnostics</h3>
                        <dl>
                            <div><dt>Internal endpoint</dt><dd>{diagnostics.endpoint}</dd></div>
                            <div><dt>HTTP status</dt><dd>{diagnostics.status}</dd></div>
                            <div><dt>Failure source</dt><dd>{diagnostics.source}</dd></div>
                        </dl>
                        <span>Response body</span>
                        <pre>{diagnostics.body}</pre>
                    </section>
                )}
            </section>
        </main>
    )
}
