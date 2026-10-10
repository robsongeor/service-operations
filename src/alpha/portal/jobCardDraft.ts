export type JobCardDraft = {
    story: string; hourMeter: string; hourMeterRecordedDate: string
    timeEntries: { date: string; hours: string; kilometres: string }[]
    parts: { description: string; quantity: string }[]
    furtherWorkRequired: boolean; furtherWorkDetails: string
    safetyIssueIdentified: boolean; safetyIssueDetails: string
}
export async function jobCardDraftKey(token: string) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    return `job-card-draft-v1:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
export function loadJobCardDraft(storage: Pick<Storage, 'getItem'>, key: string, now = Date.now()): JobCardDraft | null {
    try {
        const raw = storage.getItem(key)
        if (!raw || raw.length > 100000) return null
        const saved = JSON.parse(raw)
        const d = saved.draft
        const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max
        if (saved.version !== 1 || !Number.isFinite(saved.savedOn) || saved.savedOn > now || now - saved.savedOn > 7 * 86400000 || !d
            || !['story', 'furtherWorkDetails', 'safetyIssueDetails'].every((key) => text(d[key], 10000))
            || !text(d.hourMeter, 20) || !text(d.hourMeterRecordedDate, 10)
            || typeof d.furtherWorkRequired !== 'boolean' || typeof d.safetyIssueIdentified !== 'boolean'
            || !Array.isArray(d.timeEntries) || d.timeEntries.length > 50 || !d.timeEntries.every((r: Record<string, unknown>) => r && ['date', 'hours', 'kilometres'].every((key) => text(r[key], 30)))
            || !Array.isArray(d.parts) || d.parts.length > 100 || !d.parts.every((r: Record<string, unknown>) => r && text(r.description, 1000) && text(r.quantity, 20))) return null
        return d as JobCardDraft
    } catch { return null }
}
export function saveJobCardDraft(storage: Pick<Storage, 'setItem'>, key: string, draft: JobCardDraft, now = Date.now()) {
    storage.setItem(key, JSON.stringify({ version: 1, savedOn: now, draft }))
}
