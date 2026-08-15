import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveSiteNameFromAddress } from '../src/alpha/shared/siteName.ts'

test('Site name uses the NZ locality rather than district and postcode', () => {
    assert.equal(deriveSiteNameFromAddress('78 Maketu Road, Drury, Franklin 2577, New Zealand'), 'Drury')
    assert.equal(deriveSiteNameFromAddress('12 Queen Street, Auckland Central, Auckland 1010, New Zealand'), 'Auckland Central')
})

test('Site name retains sensible fallbacks for shorter addresses', () => {
    assert.equal(deriveSiteNameFromAddress('1 Main Road, Hamilton 3204, New Zealand'), 'Hamilton')
    assert.equal(deriveSiteNameFromAddress('Workshop, Rotorua'), 'Rotorua')
})
