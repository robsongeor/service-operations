import test from 'node:test'
import assert from 'node:assert/strict'
import { canUseWorkshopAssistant } from '../src/alpha/workshop-assistant/domain/workshopAssistantAccess.ts'

test('Workshop Assistant is available only to the existing Service Operations administrator when enabled', () => {
    assert.equal(canUseWorkshopAssistant({ storageId: 'george', displayName: 'George', username: 'georger@liftrucks.co.nz' }, true), true)
    assert.equal(canUseWorkshopAssistant({ storageId: 'other', displayName: 'Other', username: 'other@liftrucks.co.nz' }, true), false)
    assert.equal(canUseWorkshopAssistant({ storageId: 'george', displayName: 'George', username: 'georger@liftrucks.co.nz' }, false), false)
    assert.equal(canUseWorkshopAssistant(null, true), false)
})
