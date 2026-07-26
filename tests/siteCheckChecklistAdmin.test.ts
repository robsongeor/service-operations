import assert from 'node:assert/strict'
import test from 'node:test'
import {
    newChecklistDraftItem,
    validateChecklistDraft,
} from '../src/alpha/site-checks/domain/siteCheckChecklistAdmin.ts'
import { buildChecklistPublicationChangeSet } from '../src/alpha/site-checks/services/siteCheckChecklistAdminApi.ts'
import { SITE_CHECK_CHECKLIST_RESPONSE_TYPES } from '../src/alpha/site-checks/types/siteCheckChecklist.types.ts'

const template = {
    gr_sitecheckchecklisttemplateid: '11111111-1111-1111-1111-111111111111',
    gr_name: 'ICE Site Check',
    gr_templatecode: 'SITE_CHECK_ICE',
    gr_version: 1,
    gr_active: true,
    '@odata.etag': 'W/"7"',
}

const items = [{
    clientId: 'one',
    itemKey: 'visual.damage',
    groupName: 'Visual',
    prompt: 'Check for damage.',
    responseType: SITE_CHECK_CHECKLIST_RESPONSE_TYPES.PASS_FAIL_NOT_APPLICABLE,
    required: true,
    commentRequiredOnNegative: true,
    photoRequiredOnNegative: false,
}, {
    clientId: 'two',
    itemKey: 'meter.hours',
    groupName: 'Operational',
    prompt: 'Record service meter.',
    responseType: SITE_CHECK_CHECKLIST_RESPONSE_TYPES.NUMBER,
    required: true,
    commentRequiredOnNegative: false,
    photoRequiredOnNegative: false,
}]

test('checklist draft validation rejects empty, duplicated, and incoherent questions', () => {
    assert.match(validateChecklistDraft([]).join(' '), /at least one/i)
    assert.match(validateChecklistDraft([
        { ...items[0], prompt: '', itemKey: 'duplicate' },
        { ...items[1], itemKey: 'duplicate', commentRequiredOnNegative: true },
    ]).join(' '), /question text/i)
    assert.match(validateChecklistDraft([
        { ...items[0], itemKey: 'duplicate' },
        { ...items[1], itemKey: 'duplicate' },
    ]).join(' '), /duplicate item key/i)
    assert.match(validateChecklistDraft([
        { ...items[1], commentRequiredOnNegative: true },
    ]).join(' '), /cannot require a failure comment/i)
})

test('new checklist questions use safe defaults and a stable unique key', () => {
    const item = newChecklistDraftItem()
    assert.match(item.itemKey, /^new\.[a-f0-9]{8}$/)
    assert.equal(item.required, true)
    assert.equal(item.commentRequiredOnNegative, true)
})

test('publication atomically creates a new version and items before deactivating the old version', () => {
    const batch = buildChecklistPublicationChangeSet(
        template,
        items,
        '22222222-2222-2222-2222-222222222222',
    )
    assert.equal(batch.nextVersion, 2)
    assert.equal(batch.operationCount, 4)
    assert.match(batch.body, /POST \/api\/data\/v9\.2\/gr_sitecheckchecklisttemplates/)
    assert.match(batch.body, /"gr_version":2/)
    assert.match(batch.body, /"gr_ChecklistTemplate@odata\.bind":"\$1"/)
    assert.match(batch.body, /PATCH \/api\/data\/v9\.2\/gr_sitecheckchecklisttemplates\(11111111/)
    assert.match(batch.body, /If-Match: W\/"7"/)
    assert.match(batch.body, /"gr_active":false/)
})

test('publication refuses stale templates before issuing a request', () => {
    assert.throws(
        () => buildChecklistPublicationChangeSet({ ...template, '@odata.etag': undefined }, items),
        /Reload the active checklist/,
    )
})
