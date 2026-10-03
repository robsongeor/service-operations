import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { customerSearchResults, scheduleCustomerSearch, type SearchCustomers } from '../src/alpha/jobs/hooks/useCustomerSearch.ts'
import type { Customer } from '../src/alpha/jobs/types/customer.types.ts'

const customer = (id: string, name: string): Customer => ({ gr_customerid: id, gr_name: name })
const flush = async () => { for (let n = 0; n < 6; n++) await Promise.resolve() }
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Customer results are filtered and bounded before rendering, including a large cached directory', () => {
    const customers = Array.from({ length: 5000 }, (_, n) => customer(`id-${n}`, `Customer ${n}`))
    assert.equal(customerSearchResults('', customers).length, 8)
    assert.deepEqual(customerSearchResults(' CUSTOMER 4999 ', customers), [customers[4999]])
    assert.deepEqual(customerSearchResults('No match', customers), [])
    assert.equal(customers.length, 5000)
})

test('Remote matches take precedence, IDs deduplicate and unrelated old matches are discarded', () => {
    const local = [customer('ABC', 'Acme old'), customer('other', 'Other customer')]
    const remote = [customer('abc', 'Acme current'), customer('new', 'Acme new')]
    assert.deepEqual(customerSearchResults('acme', local, remote), remote)
    assert.deepEqual(customerSearchResults('other', local, remote), [local[1]])
    assert.deepEqual(customerSearchResults('', [], Array.from({ length: 30 }, (_, n) => customer(String(n), 'Acme'))).length, 8)
})

test('A selected customer can display immediately without seeding every equipment customer', () => {
    const selected = customer('linked', 'Known customer')
    assert.deepEqual(customerSearchResults('Known customer', [selected]), [selected])
    assert.deepEqual(customerSearchResults('new query', [selected]), [])
    assert.deepEqual(customerSearchResults('', []), [])
})

test('Customer search requires an open field and two characters; typing is debounced', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const calls: string[] = []
    const search: SearchCustomers = async (query) => { calls.push(query); return [] }
    const update = () => undefined
    for (const query of ['', ' ', 'x']) scheduleCustomerSearch(query, true, search, update)
    scheduleCustomerSearch('Acme', false, search, update)
    scheduleCustomerSearch('Acme', true, undefined, update)
    t.mock.timers.tick(300); await flush()
    assert.equal(calls.length, 0)
    const cancel = scheduleCustomerSearch('Ac', true, search, update)
    t.mock.timers.tick(200); cancel()
    scheduleCustomerSearch(' Acme ', true, search, update)
    t.mock.timers.tick(249); await flush()
    assert.equal(calls.length, 0)
    t.mock.timers.tick(1); await flush()
    assert.deepEqual(calls, ['acme'])
})

test('Closing or changing the search aborts pending work and late results cannot replace newer matches', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    let resolveOld!: (rows: Customer[]) => void
    let signal: AbortSignal | undefined
    const states: { rows: Customer[]; status: string }[] = []
    const old: SearchCustomers = (_, currentSignal) => { signal = currentSignal; return new Promise((resolve) => { resolveOld = resolve }) }
    const cancel = scheduleCustomerSearch('old', true, old, (state) => states.push(state))
    t.mock.timers.tick(250); await flush()
    cancel()
    assert.equal(signal?.aborted, true)
    scheduleCustomerSearch('new', true, async () => [customer('new', 'New customer')], (state) => states.push(state))
    t.mock.timers.tick(250); await flush()
    const before = structuredClone(states)
    resolveOld([customer('old', 'Old customer')]); await flush()
    assert.deepEqual(states, before)
    assert.equal(states.at(-1)?.rows[0].gr_customerid, 'new')
})

test('Failed searches stay distinct from no matches, cancelled failures are ignored, and overlarge responses stay bounded', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const states: { rows: Customer[]; status: string }[] = []
    scheduleCustomerSearch('test', true, async () => { throw new Error('sample error') }, (state) => states.push(state))
    t.mock.timers.tick(250); await flush()
    assert.equal(states.at(-1)?.status, 'error')
    let reject!: (error: Error) => void
    const cancel = scheduleCustomerSearch('slow', true, () => new Promise((_, failure) => { reject = failure }), (state) => states.push(state))
    t.mock.timers.tick(250); await flush(); cancel()
    const before = states.length
    reject(new Error('late failure')); await flush()
    assert.equal(states.length, before)
    scheduleCustomerSearch('test', true, async () => Array.from({ length: 50 }, (_, n) => customer(String(n), 'Test')), (state) => states.push(state))
    t.mock.timers.tick(250); await flush()
    assert.equal(states.at(-1)?.rows.length, 8)
    assert.equal(states.at(-1)?.status, 'idle')
})

test('Both drawers use the canonical field, existing picker and one search hook; Intake has no directory fan-out', () => {
    const relationships = read('../src/alpha/jobs/components/JobRelationshipFields.tsx')
    const book = read('../src/alpha/job-book/JobBookPrototypeScreen.tsx')
    const adapter = book.slice(book.indexOf('function CustomerPicker('), book.indexOf('function MechanicPicker('))
    const field = read('../src/alpha/jobs/components/JobCustomerField.tsx')
    assert.match(relationships, /<JobCustomerField/)
    assert.match(adapter, /<JobCustomerField/)
    assert.match(field, /<CustomerRelationshipPicker/)
    assert.match(field, /useCustomerSearch/)
    assert.doesNotMatch(adapter, /equipment|setTimeout|fetch|remoteCustomers|__saved-customer-text__/)
    assert.match(book, /className="job-edit-field-wide">[\s\S]*?<CustomerPicker id="job-book-drawer-customer"/)
    assert.match(adapter, /This does not create master Dataverse records/)
    const hook = read('../src/alpha/jobs/hooks/useCustomerSearch.ts')
    assert.match(hook, /state\?\.query === normalizedQuery/)
    assert.match(hook, /state\?\.search === onSearchCustomers/)
    assert.match(hook, /state\?\.attempt === attempt/)
})
