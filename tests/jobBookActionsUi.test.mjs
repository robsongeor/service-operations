import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let server, Actions, Composer
const originalFetch = globalThis.fetch
const originalWindow = globalThis.window
const unavailable = () => { throw new Error('Rendering must not queue or send email.') }
test.before(async () => {
    globalThis.fetch = unavailable
    globalThis.window = { location: { hostname: '127.0.0.1' } }
    server = await createServer({ configFile: false, envDir: false, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' })
    Actions = (await server.ssrLoadModule('/src/alpha/jobs/components/JobQuickActions.tsx')).default
    Composer = (await server.ssrLoadModule('/src/alpha/jobs/components/JobEmailComposer.tsx')).default
})
test.after(async () => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; await server?.close() })

const job = {
    gr_jobid: 'job', gr_jobnumber: 'WJ1234567', gr_jobtype: 122830000, gr_status: 122830001,
    gr_description: 'Repair the hose', gr_Mechanic: { gr_mechanicid: 'mechanic', gr_name: 'Sample Technician', gr_email: 'technician@example.invalid' },
}
const renderComposer = (assignedRecipientOnly) => renderToStaticMarkup(createElement(Composer, { job, assignedRecipientOnly, onCancel: unavailable, onSend: unavailable }))

test('shared row controls hide email without permission and expose accessible copy label', () => {
    const html = renderToStaticMarkup(createElement(Actions, { onCopy: unavailable, labels: true }))
    assert.match(html, /aria-label="Copy for order number book"/)
    assert.match(html, /Copy for order book/)
    assert.doesNotMatch(html, /Email to technician/)
})

test('shared row controls present blocked reasons and prevent double-send while delivery is pending', () => {
    const blocked = renderToStaticMarkup(createElement(Actions, { onCopy: unavailable, onEmail: unavailable, emailBlockedReason: 'Ask a coordinator to assign a technician.' }))
    assert.match(blocked, /title="Ask a coordinator to assign a technician\." aria-label="Email to technician" disabled=""/)
    const pending = renderToStaticMarkup(createElement(Actions, { onCopy: unavailable, onEmail: unavailable, labels: true, emailDelivery: { status: 'sending', message: 'Queued' } }))
    assert.match(pending, /aria-label="Email to technician" disabled=""/)
    assert.match(pending, /Sending…/)
})

test('Admin composer locks recipient but leaves subject and comments editable without exposing allocation', () => {
    const html = renderComposer(true)
    assert.match(html, /type="email" readOnly=""[^>]*value="technician@example.invalid"/)
    assert.match(html, /A service coordinator must change the allocation/)
    assert.match(html, /type="text" maxLength="500"[^>]*value="Job:/)
    assert.match(html, /<textarea rows="3" maxLength="2000"><\/textarea>/)
    assert.doesNotMatch(html, /<select|Assign technician|Change technician/)
})

test('coordinator composer retains editable recipient; local sends stay disabled for both roles', () => {
    const html = renderComposer(false)
    assert.match(html, /type="email" autofocus=""/)
    assert.doesNotMatch(html, /readOnly/)
    for (const markup of [html, renderComposer(true)]) {
        assert.match(markup, /Local preview only/)
        assert.match(markup, /disabled="">Sending disabled locally/)
        assert.match(markup, /Repair the hose/)
    }
})
