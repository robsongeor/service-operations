import { useEffect, useMemo, useState } from 'react'
import type {
    OperationalDiagnosticsSnapshot,
    OperationalQueryMetric,
    OperationalScreenName,
} from './OperationalDataClient'
import { useOperationalDataClient } from './OperationalDataClientContext'
import './OperationalDataDiagnostics.css'

const SCREENS: OperationalScreenName[] = ['Jobs', 'Customer Dashboard', 'Equipment', 'Scheduling', 'WOF']

function queryScreen(family: string): OperationalScreenName | 'Shared / other' {
    if (family.startsWith('customer-dashboard:')) return 'Customer Dashboard'
    if (family.startsWith('scheduler:')) return 'Scheduling'
    if (family.startsWith('wof:')) return 'WOF'
    if (family.startsWith('equipment:')) return 'Equipment'
    if (family.startsWith('jobs:') || family.startsWith('job:') || family.startsWith('job-photo:')) return 'Jobs'
    return 'Shared / other'
}

function combineQueries(metrics: readonly OperationalQueryMetric[]) {
    return metrics.reduce((combined, metric) => ({
        requests: combined.requests + metric.requests,
        cacheHits: combined.cacheHits + metric.cacheHits,
        deduplicatedRequests: combined.deduplicatedRequests + metric.deduplicatedRequests,
        successes: combined.successes + metric.successes,
        failures: combined.failures + metric.failures,
        aborted: combined.aborted + metric.aborted,
        totalDurationMs: combined.totalDurationMs + metric.totalDurationMs,
        payloadBytes: combined.payloadBytes + metric.payloadBytes,
    }), {
        requests: 0,
        cacheHits: 0,
        deduplicatedRequests: 0,
        successes: 0,
        failures: 0,
        aborted: 0,
        totalDurationMs: 0,
        payloadBytes: 0,
    })
}

function milliseconds(value: number) {
    return value > 0 ? `${Math.round(value).toLocaleString()} ms` : '-'
}

function kilobytes(bytes: number) {
    return bytes > 0 ? `${(bytes / 1024).toFixed(bytes >= 1024 * 100 ? 0 : 1)} KB` : '-'
}

export default function OperationalDataDiagnostics() {
    const client = useOperationalDataClient()
    const [open, setOpen] = useState(false)
    const [copied, setCopied] = useState(false)
    const [snapshot, setSnapshot] = useState<OperationalDiagnosticsSnapshot>(() => client.getDiagnosticsSnapshot())

    useEffect(() => client.subscribeDiagnostics(() => {
        setSnapshot(client.getDiagnosticsSnapshot())
    }), [client])

    const rows = useMemo(() => SCREENS.map((screen) => {
        const screenMetric = snapshot.screens.find((metric) => metric.screen === screen)
        const queries = combineQueries(snapshot.queries.filter((metric) => queryScreen(metric.family) === screen))
        return { screen, screenMetric, queries }
    }), [snapshot])

    const copyReport = async () => {
        await navigator.clipboard.writeText(JSON.stringify({
            capturedAt: new Date().toISOString(),
            ...snapshot,
        }, null, 2))
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2_000)
    }

    return <>
        <button
            type="button"
            className="operational-diagnostics-trigger"
            onClick={() => setOpen(true)}
            title="Open local data-loading diagnostics"
        >
            <span aria-hidden="true">◷</span>
            <span className="operational-diagnostics-trigger-label">Data diagnostics</span>
        </button>
        {open && <div className="operational-diagnostics-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
            <section
                className="operational-diagnostics-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="operational-diagnostics-title"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header>
                    <div>
                        <span className="operational-diagnostics-eyebrow">Development only</span>
                        <h2 id="operational-diagnostics-title">Data-loading diagnostics</h2>
                    </div>
                    <button type="button" className="operational-diagnostics-close" onClick={() => setOpen(false)} aria-label="Close diagnostics">×</button>
                </header>
                <p className="operational-diagnostics-help">
                    Reset, visit each screen and wait for useful content, then copy this privacy-safe report. No record IDs or business values are captured.
                </p>
                <div className="operational-diagnostics-table-wrap">
                    <table>
                        <thead><tr>
                            <th>Screen</th><th>Ready</th><th>Requests</th><th>Cache</th><th>Deduped</th><th>Avg request</th><th>Payload</th><th>Errors</th>
                        </tr></thead>
                        <tbody>{rows.map(({ screen, screenMetric, queries }) => <tr key={screen}>
                            <th>{screen}<small>{screenMetric?.readySamples ?? 0} of {screenMetric?.visits ?? 0} visits sampled</small></th>
                            <td><strong>{milliseconds(screenMetric?.lastReadyMs ?? 0)}</strong><small>avg {milliseconds(screenMetric && screenMetric.readySamples > 0 ? screenMetric.totalReadyMs / screenMetric.readySamples : 0)}</small></td>
                            <td>{queries.requests}</td>
                            <td>{queries.cacheHits}</td>
                            <td>{queries.deduplicatedRequests}</td>
                            <td>{milliseconds(queries.successes + queries.failures + queries.aborted > 0
                                ? queries.totalDurationMs / (queries.successes + queries.failures + queries.aborted)
                                : 0)}</td>
                            <td>{kilobytes(queries.payloadBytes)}</td>
                            <td>{queries.failures}{queries.aborted > 0 ? ` / ${queries.aborted} aborted` : ''}</td>
                        </tr>)}</tbody>
                    </table>
                </div>
                <details>
                    <summary>Query family details ({snapshot.queries.length})</summary>
                    {snapshot.queries.length === 0
                        ? <p>No queries captured yet.</p>
                        : <ul>{snapshot.queries.map((metric) => <li key={metric.family}>
                            <code>{metric.family}</code>
                            <span>{metric.requests} request{metric.requests === 1 ? '' : 's'} · {milliseconds(metric.successes > 0 ? metric.totalDurationMs / metric.successes : 0)} avg · {kilobytes(metric.payloadBytes)}</span>
                        </li>)}</ul>}
                </details>
                <footer>
                    <button type="button" className="operational-diagnostics-secondary" onClick={() => {
                        client.resetDiagnostics()
                        setCopied(false)
                    }}>Reset sample</button>
                    <button type="button" className="operational-diagnostics-primary" onClick={() => void copyReport()}>{copied ? 'Copied report' : 'Copy report'}</button>
                </footer>
            </section>
        </div>}
    </>
}
