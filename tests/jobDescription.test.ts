import assert from 'node:assert/strict'
import test from 'node:test'
import {
    assertJobDescriptionLength,
    JOB_DESCRIPTION_MAX_LENGTH,
} from '../src/alpha/jobs/domain/jobDescription.ts'

test('Job descriptions allow the shared Dataverse maximum', () => {
    assert.equal(JOB_DESCRIPTION_MAX_LENGTH, 4000)
    assert.doesNotThrow(() => assertJobDescriptionLength('x'.repeat(JOB_DESCRIPTION_MAX_LENGTH)))
})

test('Job descriptions reject values beyond the shared Dataverse maximum', () => {
    assert.throws(
        () => assertJobDescriptionLength('x'.repeat(JOB_DESCRIPTION_MAX_LENGTH + 1)),
        /4,000 characters or fewer/,
    )
})
