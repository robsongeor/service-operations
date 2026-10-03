import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { mechanicSelectOptions } from '../src/alpha/jobs/utils/mechanicSelectOptions.ts'
import type { Mechanic } from '../src/alpha/jobs/types/mechanic.types.ts'

const staff = (id: string, name: string, extra: Partial<Mechanic> = {}): Mechanic => ({
    gr_mechanicid: id, gr_name: name, gr_email: '', gr_phone: '', ...extra,
})
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('Mechanic choices are capped at eight, sorted, and preserve the directory', () => {
    const mechanics = Array.from({ length: 5000 }, (_, n) => staff(String(n), `Technician ${String(5000 - n).padStart(4, '0')}`))
    const before = structuredClone(mechanics)
    const options = mechanicSelectOptions(mechanics, '')
    assert.equal(options.length, 9)
    assert.equal(options[0].kind, 'unassigned')
    assert.equal(options[1].name, 'Technician 0001')
    assert.equal(options[8].name, 'Technician 0008')
    assert.deepEqual(mechanics, before)
})

test('Mechanic search matches name, email, and phone, with whitespace and case normalization', () => {
    const mechanics = [staff('a', 'Sample Technician', { gr_email: 'sample@example.invalid', gr_phone: '021 000 000' }), staff('b', 'Another person')]
    for (const query of [' SAMPLE   TECH ', 'SAMPLE@', '021 000']) {
        const options = mechanicSelectOptions(mechanics, query)
        assert.deepEqual(options.map((option) => option.id), ['', 'a'])
    }
    assert.equal(mechanicSelectOptions(mechanics, 'missing').length, 1)
})

test('Only active assignable staff can be selected; legacy assignment flags remain compatible', () => {
    const mechanics = [
        staff('inactive', 'Inactive', { statecode: 1 }),
        staff('office', 'Office', { gr_jobassignmentenabled: false }),
        staff('legacy', 'Legacy'),
        staff('null', 'Null flag', { gr_jobassignmentenabled: null }),
    ]
    assert.deepEqual(mechanicSelectOptions(mechanics, '').map((option) => option.id), ['', 'legacy', 'null'])
})

test('Custom outwork values are opt-in, trimmed, and never synthesize Staff lookup IDs', () => {
    assert.equal(mechanicSelectOptions([], 'Outwork').length, 1)
    assert.equal(mechanicSelectOptions([], '   ', true).length, 1)
    assert.deepEqual(mechanicSelectOptions([], ' Outwork ', true).at(-1), {
        kind: 'custom', id: '', name: 'Outwork', secondary: 'Custom entry, for example outwork',
    })
    const options = mechanicSelectOptions([staff('real-id', 'Outwork')], 'Outwork', true)
    assert.equal(options[1].kind, 'mechanic')
    assert.equal(options[1].id, 'real-id')
    assert.equal(options[2].kind, 'custom')
    assert.equal(options[2].id, '')
})

test('Job Book and Job drawers reuse one mechanic selector and its existing drawer styling', () => {
    const book = read('../src/alpha/job-book/JobBookPrototypeScreen.tsx')
    const adapter = book.slice(book.indexOf('function MechanicPicker('), book.indexOf('export default function JobBookPrototypeScreen'))
    const core = read('../src/alpha/jobs/components/JobCoreFields.tsx')
    const selector = read('../src/alpha/jobs/components/SearchableMechanicSelect.tsx')
    assert.match(adapter, /<SearchableMechanicSelect/)
    assert.match(core, /<SearchableMechanicSelect/)
    assert.match(adapter, /variant="drawer"/)
    assert.match(adapter, /selectedName=\{value\}/)
    assert.match(adapter, /onSelectCustom=\{UNIFIED_JOB_WALKTHROUGH \? undefined : \(name\) => onChange\('', name\)\}/)
    assert.doesNotMatch(core, /onSelectCustom/)
    assert.doesNotMatch(adapter, /<input|\.filter\(|\.slice\(|fetch|addEventListener/)
    assert.match(selector, /selected\?\.gr_name \|\| selectedName \|\| 'Unassigned'/)
    assert.doesNotMatch(read('../src/alpha/job-book/JobBookPrototypeScreen.css'), /job-book-mechanic-/)
})

test('Shared mechanic dropdown coordinates opening and closes outside the trigger AND portal', () => {
    const selector = read('../src/alpha/jobs/components/SearchableMechanicSelect.tsx')
    assert.match(selector, /if \(!isOpen\) return\s+return closeWhenAnotherDropdownOpens/)
    assert.match(selector, /announceExclusiveDropdownOpen\(resultsId\)/)
    assert.match(selector, /!rootRef\.current\?\.contains\(target\) && !menuRef\.current\?\.contains\(target\)/)
    for (const event of ['mousedown', 'focusin']) {
        assert.ok(selector.includes(`document.addEventListener('${event}', closeOnOutsideClick, true)`))
        assert.ok(selector.includes(`document.removeEventListener('${event}', closeOnOutsideClick, true)`))
    }
    assert.match(selector, /const resultsId = useId\(\)/)
    assert.match(selector, /aria-controls=\{resultsId\}/)
    assert.match(selector, /event\.key === 'Escape'[\s\S]*event\.stopPropagation\(\)/)
    assert.match(selector, /choose\(options\[activeOptionIndex\]\)/)
})
