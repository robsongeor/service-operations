import assert from 'node:assert/strict'
import test from 'node:test'

import { buildJobSubmissionPublicUrl, jobHasActiveSubmissionLink } from '../src/alpha/jobs/services/jobSubmissionLinkApi.ts'
import {
    buildMailtoUrl,
    buildTechnicianEmailBody,
    buildTechnicianEmailSubject,
} from '../src/alpha/jobs/utils/technicianMailto.ts'
import type { Job } from '../src/alpha/jobs/types/job.types.ts'
import { buildTechnicianJobCardHtml } from '../src/alpha/jobs/services/jobEmail.ts'
import { readFileSync } from 'node:fs'

const job = {
    gr_jobid: '00000000-0000-4000-8000-000000000001',
    gr_jobnumber: '145222',
    gr_description: 'Service',
    gr_ordernumber: 'PO-42',
    gr_Equipment: {
        gr_equipmentid: 'equipment-1',
        gr_make: 'Komatsu',
        gr_model: 'FD30T-17',
        gr_fleet: 'FN1758',
        gr_serial: '356685',
    },
    gr_Site: {
        gr_siteid: 'site-1',
        gr_name: 'Hamilton',
        gr_address: '85 Princes Street',
        gr_Customer: { gr_customerid: 'customer-1', gr_name: 'Waikato Auto Parts' },
    },
    gr_Mechanic: {
        gr_mechanicid: 'mechanic-1',
        gr_name: 'Anthony Example',
        gr_email: 'anthony@example.test',
    },
} as Job

test('localhost Job Card links can target the deployed public app', () => {
    const path = '/portal/job/secure-token'
    assert.equal(
        buildJobSubmissionPublicUrl(
            path,
            'http://localhost:5173',
            'https://yellow-cliff-068680700.7.azurestaticapps.net',
        ),
        'https://yellow-cliff-068680700.7.azurestaticapps.net/portal/job/secure-token',
    )
    assert.equal(
        buildJobSubmissionPublicUrl(path, 'https://service.example.test'),
        'https://service.example.test/portal/job/secure-token',
    )
    assert.throws(
        () => buildJobSubmissionPublicUrl(path, 'http://localhost:5173', 'http://example.test'),
        /HTTPS origin/,
    )
})

test('technician email retains Job details and includes the generated portal URL', () => {
    const portalUrl = 'https://service.example.test/portal/job/secure-token'
    const body = buildTechnicianEmailBody(job, 'Anthony Example', portalUrl)
    const mailto = buildMailtoUrl({
        recipient: job.gr_Mechanic!.gr_email!,
        subject: buildTechnicianEmailSubject(job),
        body,
    })

    assert.match(body, /145222/)
    assert.match(body, /Komatsu FD30T-17/)
    assert.match(body, /FN1758/)
    assert.match(body, /Waikato Auto Parts/)
    assert.match(body, /PO-42/)
    assert.match(body, /COMPLETE JOB CARD/)
    assert.match(body, new RegExp(portalUrl.replaceAll('.', '\\.')))
    assert.match(decodeURIComponent(mailto), /portal\/job\/secure-token/)
})

test('technician email subject includes Job, fleet, customer and description', () => {
    assert.equal(
        buildTechnicianEmailSubject(job),
        'Job: 145222 - FN1758 - Waikato Auto Parts - Service',
    )
})

test('direct technician email renders an Outlook-safe HTML Job Card with a clickable secure link', () => {
    const portalUrl = 'https://service.example.test/portal/job/secure-token?a=1&b=2'
    const body = buildTechnicianJobCardHtml({ ...job, gr_description: 'Inspect <mast> & chains' }, 'Anthony Example', portalUrl)
    assert.match(body, /<!doctype html>/i)
    assert.match(body, /<table role="presentation"/)
    assert.match(body, /href="https:\/\/service\.example\.test\/portal\/job\/secure-token\?a=1&amp;b=2"/)
    assert.match(body, />Open Job Card<\/a>/)
    assert.match(body, /Inspect &lt;mast&gt; &amp; chains/)
    assert.doesNotMatch(body, /Inspect <mast>/)
})

test('Jobs table opens the in-app composer and no longer hands off to mailto', () => {
    const table = readFileSync(new URL('../src/alpha/jobs/components/JobsTable.tsx', import.meta.url), 'utf8')
    const composer = readFileSync(new URL('../src/alpha/jobs/components/JobEmailComposer.tsx', import.meta.url), 'utf8')
    const hook = readFileSync(new URL('../src/alpha/jobs/hooks/useJobs.ts', import.meta.url), 'utf8')
    assert.match(table, /<JobEmailComposer/)
    assert.doesNotMatch(table, /window\.location\.href|mailto:/)
    assert.match(composer, /Send Job Card/)
    assert.match(hook, /void \(async \(\) =>/)
    assert.match(hook, /waitForEmailDispatch/)
})

test('active link detection requires an unused, unexpired stored hash', () => {
    const active = {
        ...job,
        gr_techniciansubmissiontokenhash: 'a'.repeat(64),
        gr_techniciansubmissiontokenused: false,
        gr_techniciansubmissiontokenexpireson: '2026-07-25T12:00:00.000Z',
    }
    const now = Date.parse('2026-07-25T11:00:00.000Z')
    assert.equal(jobHasActiveSubmissionLink(active, now), true)
    assert.equal(jobHasActiveSubmissionLink({ ...active, gr_techniciansubmissiontokenused: true }, now), false)
    assert.equal(jobHasActiveSubmissionLink({ ...active, gr_techniciansubmissiontokenexpireson: '2026-07-25T10:00:00.000Z' }, now), false)
})
