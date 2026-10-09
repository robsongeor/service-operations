const GREEN_TREE_SYNC_COOLDOWN_MS = 10 * 60_000
const GREEN_TREE_INITIAL_LOOKBACK_MS = 23 * 60 * 60_000

export type GreenTreeJobReconciliationResult = {
    checkedAt: string
    skipped?: boolean
    reason?: 'cooldown' | 'running'
    received: number
    matched: number
    updated: number
    markedEntered: number
    movedToCompletionReview: number
    alreadyComplete: number
    intakeMatched: number
    intakeUpdated: number
    unmatched: string[]
    conflicts: string[]
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
        body: JSON.stringify({ modifiedSince: new Date(now - GREEN_TREE_INITIAL_LOOKBACK_MS).toISOString() }),
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
