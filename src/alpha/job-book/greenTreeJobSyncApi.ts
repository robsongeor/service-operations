const GREEN_TREE_SYNC_COOLDOWN_MS = 10 * 60_000

export type GreenTreeJobReconciliationResult = {
    checkedAt: string
    skipped?: boolean
    reason?: 'cooldown' | 'running'
    mode?: 'scheduled'
    due: number
    selected: number
    checked: number
    updatedRecords: number
    notEntered: number
    open: number
    closed: number
    finalised: number
    remaining: number
    conflicts: string[]
    failed: string[]
}

let lastAttemptAt = 0
let activeRequest: Promise<GreenTreeJobReconciliationResult | null> | null = null

export function requestGreenTreeJobReconciliation(accessToken: string) {
    const now = Date.now()
    if (activeRequest) return activeRequest
    if (now - lastAttemptAt < GREEN_TREE_SYNC_COOLDOWN_MS) return Promise.resolve(null)
    lastAttemptAt = now
    activeRequest = fetch('/api/greentreejobchanges', {
        method: 'POST',
        headers: {
            'X-Dataverse-Authorization': `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'scheduled' }),
    }).then(async (response) => {
        if (!response.ok) throw new Error('Automatic GreenTree reconciliation is temporarily unavailable.')
        return response.json() as Promise<GreenTreeJobReconciliationResult>
    }).finally(() => { activeRequest = null })
    return activeRequest
}

export function resetGreenTreeJobReconciliationCooldownForTests() {
    lastAttemptAt = 0
    activeRequest = null
}
