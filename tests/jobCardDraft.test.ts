import assert from 'node:assert/strict'
import test from 'node:test'
import { jobCardDraftKey, loadJobCardDraft, saveJobCardDraft, type JobCardDraft } from '../src/alpha/portal/jobCardDraft.ts'
const draft: JobCardDraft = { story: 'Work', hourMeter: '0', hourMeterRecordedDate: '2026-10-01', timeEntries: [{ date: '2026-10-01', hours: '1', kilometres: '0' }], parts: [], furtherWorkRequired: false, furtherWorkDetails: '', safetyIssueIdentified: false, safetyIssueDetails: '' }
test('drafts are token-isolated without storing bearer tokens and expire after seven days', async () => {
    const key = await jobCardDraftKey('secret-token')
    assert.notEqual(key, await jobCardDraftKey('another-token'))
    assert.doesNotMatch(key, /secret-token/)
    const records = new Map<string, string>()
    const storage = { getItem: (k: string) => records.get(k) ?? null, setItem: (k: string, v: string) => { records.set(k, v) } }
    saveJobCardDraft(storage, key, draft, 1000)
    assert.deepEqual(loadJobCardDraft(storage, key, 1100), draft)
    assert.equal(loadJobCardDraft(storage, key, 8 * 86400000), null)
    assert.equal(loadJobCardDraft(storage, 'different-key', 1100), null)
    storage.setItem(key, '{invalid')
    assert.equal(loadJobCardDraft(storage, key, 1100), null)
})
