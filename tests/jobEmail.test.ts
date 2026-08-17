import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { buildJobSubmissionPublicUrl, jobHasActiveSubmissionLink } from '../src/alpha/jobs/services/jobSubmissionLinkApi.ts'
import {
    buildMailtoUrl,
    buildTechnicianEmailBody,
    buildTechnicianEmailSubject,
} from '../src/alpha/jobs/utils/technicianMailto.ts'
import type { Job } from '../src/alpha/jobs/types/job.types.ts'
import { buildTechnicianJobCardHtml, onlineJobCardPilotEnabled } from '../src/alpha/jobs/services/jobEmail.ts'

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
        gr_alternatefleetnumbers: 'SITE-42\nVFL001758',
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
    gr_Contact: {
        gr_contactid: 'contact-1',
        gr_name: 'Aroha Example',
        gr_phone: '021 555 0123',
        gr_email: 'aroha@example.test',
    },
} as Job

test('localhost Job Card links can target the deployed public app', () => {
    const path = '/portal/job/secure-token'
    assert.equal(
        buildJobSubmissionPublicUrl(path, 'http://localhost:5173', 'https://yellow-cliff-068680700.7.azurestaticapps.net'),
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
    assert.equal(buildTechnicianEmailSubject(job), 'Job: 145222 - FN1758 - Waikato Auto Parts - Service')
})

test('Mouhib pilot email renders escaped content and the generated secure link', () => {
    const portalUrl = 'https://service.example.test/portal/job/secure-token?a=1&b=2'
    const body = buildTechnicianJobCardHtml(
        { ...job, gr_description: 'Inspect <mast> & chains' },
        'Mouhib',
        portalUrl,
        'Use gate <B> & call site\nbefore entry.',
    )
    assert.match(body, /<!doctype html>/i)
    assert.match(body, /<table role="presentation"/)
    assert.match(body, /href="https:\/\/service\.example\.test\/portal\/job\/secure-token\?a=1&amp;b=2"/)
    assert.match(body, /Open Job Card/)
    assert.match(body, /Inspect &lt;mast&gt; &amp; chains/)
    assert.match(body, /FN1758 \/ SITE-42 \/ VFL001758/)
    assert.doesNotMatch(body, /Inspect <mast>/)
    assert.match(body, /Use gate &lt;B&gt; &amp; call site<br>before entry\./)
    assert.doesNotMatch(body, /Use gate <B>/)
    assert.match(body, /Aroha Example/)
    assert.match(body, /021 555 0123/)
    assert.match(body, /aroha@example\.test/)
})

test('online Job Card pilot is restricted to approved recipients and other email stays disabled', () => {
    assert.equal(onlineJobCardPilotEnabled('nzmouhib@yahoo.co.nz'), true)
    assert.equal(onlineJobCardPilotEnabled(' NZMOUHIB@YAHOO.CO.NZ '), true)
    assert.equal(onlineJobCardPilotEnabled(' georger@liftrucks.co.nz '), true)
    assert.equal(onlineJobCardPilotEnabled('another.technician@example.test'), false)
    const body = buildTechnicianJobCardHtml(job, 'Anthony Example', '')
    assert.doesNotMatch(body, /href=/)
    assert.match(body, /temporarily disabled/)
    assert.match(body, /Online Job Card access is currently disabled/)
})

test('technician email rejects comments beyond the bounded message limit', () => {
    assert.throws(
        () => buildTechnicianJobCardHtml(job, 'Mouhib', 'https://service.example.test', 'x'.repeat(2001)),
        /2000 characters or fewer/,
    )
})

test('Jobs table uses the in-app composer and pilot-gated link generation', () => {
    const table = readFileSync(new URL('../src/alpha/jobs/components/JobsTable.tsx', import.meta.url), 'utf8')
    const composer = readFileSync(new URL('../src/alpha/jobs/components/JobEmailComposer.tsx', import.meta.url), 'utf8')
    const composerStyles = readFileSync(new URL('../src/alpha/jobs/components/JobEmailComposer.css', import.meta.url), 'utf8')
    const hook = readFileSync(new URL('../src/alpha/jobs/hooks/useJobs.ts', import.meta.url), 'utf8')
    assert.match(table, /<JobEmailComposer/)
    assert.doesNotMatch(table, /window\.location\.href|mailto:/)
    assert.match(composer, /Send Job Card/)
    assert.match(composer, /Comments for technician/)
    assert.match(composer, /onlineJobCardPilotEnabled/)
    assert.match(composer, /Contact email/)
    assert.match(composerStyles, /\.edit-form-dialog\.job-email-composer\s*\{[\s\S]*width: min\(840px, calc\(100vw - 32px\)\)/)
    assert.match(hook, /onlineJobCardPilotEnabled/)
    assert.match(hook, /void \(async \(\) =>/)
    assert.match(hook, /waitForEmailDispatch/)
})

test('submitted technician cards can start a confirmed new submission cycle', () => {
    const fields = readFileSync(new URL('../src/alpha/jobs/components/JobCardFields.tsx', import.meta.url), 'utf8')
    assert.match(fields, /submitted \? 'Send again'/)
    assert.match(fields, /status !== JOB_CARD_STATUSES\.NOT_SENT/)
    assert.match(fields, /their evidence will be preserved and a new submission cycle will start/)
    assert.match(fields, /Previous submissions/)
    assert.match(fields, /allowSend=\{false\}/)
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
