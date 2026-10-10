import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PDFDocument } from 'pdf-lib'
import { buildJobSheetValues, renderJobSheetPdf } from '../src/alpha/portal/jobSheetPdf.ts'
import { buildSubmittedJobSheet } from '../src/alpha/jobs/services/submittedJobSheetPdf.ts'
import type { Job } from '../src/alpha/jobs/types/job.types.ts'
import type { JobCardSubmission } from '../src/alpha/jobs/types/jobCardSubmission.types.ts'
import { buildReviewJobSheet, createJobCardReviewPdf, renderJobCardReviewPdf } from '../src/alpha/job-card-reviews/jobCardReviewPdf.ts'
import type { JobCardReview } from '../src/alpha/job-card-reviews/jobCardReview.types.ts'
import { mkdir, writeFile } from 'node:fs/promises'

const job = {
    jobNumber: '145995',
    orderNumber: 'PO-88',
    equipmentDisplayName: 'Still RX60-25',
    fleetNumber: 'FN1695',
    equipmentMake: 'Still',
    equipmentModel: 'RX60-25',
    equipmentSerial: 'SER-1695',
    customerName: 'Example Customer',
    siteName: 'Workshop',
    siteAddress: '1 Example Road, Auckland',
    technicianName: 'Mouhib',
    workRequired: 'Replace broken headlight.',
    requiresHourMeter: true,
    currentHourMeter: 3636,
}

const draft = {
    hourMeter: '3642',
    story: 'Replaced headlight and tested operation.',
    timeEntries: [
        { date: '2026-08-17', hours: 1.25, kilometres: 12 },
        { date: '2026-08-17', hours: 0.75, kilometres: 3 },
    ],
    parts: [{ description: 'Headlight assembly', quantity: 1 }],
    furtherWorkDetails: 'Inspect the damaged wiring at the next service.',
    safetyIssueDetails: 'Machine was isolated while testing.',
}

test('Azure PDF fills the real template and retains long saved evidence on continuation pages without current data or mutation', async () => {
    const review: JobCardReview = {
        ...job, reviewId: 'synthetic-review-only', etag: 'test', status: 'pendingReview', sourceJobId: 'test-job',
        submittedOn: '2026-10-02T00:00:00Z', hourMeter: 3642, photoCount: 1,
        story: `${'Checked hydraulic connections and tested the machine under load. '.repeat(90)}STORY-END`,
        timeEntries: Array.from({ length: 50 }, (_, index) => ({ date: `2026-09-${String(index % 28 + 1).padStart(2, '0')}`, hours: 0.25, kilometres: index })),
        parts: Array.from({ length: 100 }, (_, index) => ({ description: `TEST-PART-${index + 1} ${'long-item-description-'.repeat(index === 99 ? 20 : 1)}`, quantity: index + 1 })),
        furtherWorkRequired: true, furtherWorkDetails: 'Further work remains recorded. FURTHER-END',
        safetyIssueIdentified: true, safetyIssueDetails: 'Safety observation retained. SAFETY-END',
        photos: [{ id: 'test-photo', fileName: 'synthetic-evidence.png', mimeType: 'image/png', size: 100 }],
    }
    const before = JSON.stringify(review)
    const original = globalThis.fetch
    globalThis.fetch = async () => { throw new Error('Saved PDF must not access network or current Job data.') }
    try {
        const blob = await renderJobCardReviewPdf(review, await readFile('docs/templates/jobsheet-template.pdf'))
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const pdf = await PDFDocument.load(bytes)
        assert.ok(pdf.getPageCount() >= 5)
        assert.match(pdf.getTitle() || '', /145995.*Field Service Inspection Report/)
        assert.equal(pdf.getForm().getTextField('job').getText()?.trim(), '145995')
        assert.equal(pdf.getForm().getTextField('description').getText(), 'See continuation')
        assert.equal(pdf.getForm().getTextField('generated-parts').getText(), 'See continuation')
        assert.equal(JSON.stringify(review), before)
        if (process.env.JOB_CARD_PDF_QA === 'true') {
            await mkdir('tmp/pdfs', { recursive: true })
            await writeFile('tmp/pdfs/job-card-long-qa.pdf', bytes)
        }
    } finally { globalThis.fetch = original }
})

test('saved Job card mapping does not substitute live contact or current meter; zero is retained', () => {
    const review = { ...job, hourMeter: undefined, currentHourMeter: 9999, submittedOn: '2026-10-01T12:00:00Z', story: 'Saved story', timeEntries: [], parts: [], furtherWorkRequired: true, safetyIssueIdentified: true } as unknown as JobCardReview
    const sheet = buildReviewJobSheet(review)
    assert.equal(sheet.details.currentHourMeter, undefined)
    assert.equal(sheet.details.siteContactName, undefined)
    assert.equal(sheet.draft.hourMeter, '')
    assert.equal(buildReviewJobSheet({ ...review, hourMeter: 0 }).draft.hourMeter, '0')
    assert.match(sheet.draft.furtherWorkDetails || '', /Required - details not supplied/)
    assert.match(sheet.draft.safetyIssueDetails || '', /Identified - details not supplied/)
})

test('PDF creation fetches only the bundled template, propagates abort and fails rather than inventing a fallback', async (t) => {
    const signal = new AbortController().signal
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.match(String(url), /jobsheet-template\.pdf$/)
        assert.equal(options?.signal, signal)
        return new Response('', { status: 404 })
    })
    await assert.rejects(createJobCardReviewPdf({} as JobCardReview, signal), /template could not be loaded/)
})

test('weekday collisions retain separate dates instead of adding different weeks under one date', () => {
    const values = buildJobSheetValues(job, { ...draft, timeEntries: [{ date: '2026-08-17', hours: 2, kilometres: 10 }, { date: '2026-08-24', hours: 3, kilometres: 20 }] })
    assert.equal(values['date-1'], 'See cont.')
    assert.equal(values['hours-1'], '')
    assert.equal(values['mileage-1'], '')
})

test('normal saved card fills template fields and leaves signatures untouched with NZ submitted date', async () => {
    const review = { ...job, hourMeter: 0, story: 'SAMPLE ONLY - Replaced headlight and tested operation.', timeEntries: [{ date: '2026-10-03', hours: 2, kilometres: 12 }, { date: '2026-10-04', hours: 1, kilometres: 8 }], parts: draft.parts, furtherWorkRequired: false, safetyIssueIdentified: false, submittedOn: '2026-10-01T12:00:00Z' } as unknown as JobCardReview
    const blob = await renderJobCardReviewPdf(review, await readFile('docs/templates/jobsheet-template.pdf'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const pdf = await PDFDocument.load(bytes)
    const form = pdf.getForm()
    assert.equal(pdf.getPageCount(), 1)
    assert.equal(form.getTextField('hours').getText()?.trim(), '0')
    assert.equal(form.getTextField('generated-date-footer').getText(), '02/10/2026')
    assert.equal(form.getTextField('site-contact').getText() || '', '')
    assert.equal(form.getTextField('CLIENTS NAME').getText() || '', '')
    assert.equal(form.getTextField('date-6').getText(), '03/10')
    assert.equal(form.getTextField('date-7').getText(), '04/10')
    assert.equal(form.getTextField('date-6').acroField.getWidgets()[0].getRectangle().y, form.getTextField('hours-6').acroField.getWidgets()[0].getRectangle().y)
    assert.equal(form.getTextField('date-7').acroField.getWidgets()[0].getRectangle().y, form.getTextField('hours-7').acroField.getWidgets()[0].getRectangle().y)
    if (process.env.JOB_CARD_PDF_QA === 'true') {
        await mkdir('tmp/pdfs', { recursive: true })
        await writeFile('tmp/pdfs/job-card-normal-qa.pdf', bytes)
    }
})

test('Job sheet values combine Job details and current technician form entries', () => {
    const values = buildJobSheetValues(job, draft)
    assert.equal(values.job.trim(), '145995')
    assert.equal(values.orderNo.trim(), 'PO-88')
    assert.equal(values.hours.trim(), '3642')
    assert.match(values.description, /WORK REQUIRED/)
    assert.match(values.description, /WORK COMPLETED/)
    assert.equal(values['date-1'], '17/08')
    assert.equal(values['hours-1'], '2')
    assert.equal(values['mileage-1'], '15')
    assert.equal(values.chargeable, '1 x Headlight assembly')
    assert.match(values['FURTHER WORK REQUIRED  REMARKSRow1'], /Further work/)
})

test('office Job Card download maps only the selected technician submission', () => {
    const officeJob = {
        gr_jobid: 'job-1', createdon: '2026-08-01', gr_jobnumber: '145995', gr_status: 122830001,
        gr_ordernumber: 'PO-88', gr_description: 'Replace broken headlight.', gr_hourmeter: 3600,
        gr_Equipment: { gr_equipmentid: 'equipment-1', gr_fleet: 'FN1695', gr_serial: 'SER-1695', gr_make: 'Still', gr_model: 'RX60-25' },
        gr_Site: { gr_siteid: 'site-1', gr_name: 'Workshop', gr_address: '1 Example Road', gr_Customer: { gr_customerid: 'customer-1', gr_name: 'Example Customer' } },
        gr_Contact: { gr_contactid: 'contact-1', gr_name: 'Site Manager', gr_phone: '09 123 4567' },
    } as Job
    const submission = {
        gr_jobcardsubmissionid: 'submission-1', gr_name: 'Mouhib - Job Card', gr_recipientname: 'Mouhib',
        gr_role: 122830000, gr_status: 122830002, gr_submittedon: '2026-08-17T04:00:00Z', gr_hourmeter: 3642,
        gr_story: 'Replaced headlight.', gr_furtherworkrequired: true, gr_furtherworkdetails: 'Inspect wiring.',
        _gr_job_value: 'job-1', timeEntries: [{ id: 'time-1', date: '2026-08-17', hours: 2, kilometres: 15 }],
        parts: [{ id: 'part-1', part: 'Headlight assembly', quantity: 1 }], photos: [],
    } as JobCardSubmission
    const sheet = buildSubmittedJobSheet(officeJob, submission)
    assert.equal(sheet.details.technicianName, 'Mouhib')
    assert.equal(sheet.details.siteContactName, 'Site Manager')
    assert.equal(sheet.details.siteContactPhone, '09 123 4567')
    assert.equal(sheet.draft.hourMeter, '3642')
    assert.equal(sheet.draft.story, 'Replaced headlight.')
    assert.equal(sheet.draft.parts[0]?.description, 'Headlight assembly')
    assert.equal(sheet.generatedAt?.toISOString(), '2026-08-17T04:00:00.000Z')
})

test('technician PDF download is offered only after a successful submission', async () => {
    const source = await readFile('src/alpha/portal/TechnicianJobSubmissionPage.tsx', 'utf8')
    assert.match(source, /if \(submitted && job && submittedPdfDraft\)/)
    assert.equal(source.match(/Download completed Job sheet PDF/g)?.length, 1)
    assert.equal(source.includes('Download filled Job sheet PDF'), false)
    assert.match(source, /await submitPublicJobCard\(token, submission\)[\s\S]*setSubmittedPdfDraft/)
})

test('filled Job sheet remains an interactive PDF with expected field values', async () => {
    const template = await readFile('docs/templates/jobsheet-template.pdf')
    const blob = await renderJobSheetPdf(template, job, draft, new Date('2026-08-17T12:00:00+12:00'))
    assert.equal(blob.type, 'application/pdf')
    const pdf = await PDFDocument.load(await blob.arrayBuffer())
    const form = pdf.getForm()
    assert.equal(form.getTextField('job').getText()?.trim(), '145995')
    assert.equal(form.getTextField('fleet').getText()?.trim(), 'FN1695')
    assert.equal(form.getTextField('customer').getText()?.trim(), 'Example Customer')
    assert.equal(form.getTextField('machine-serial').getText()?.trim(), 'SER-1695')
    assert.equal(form.getTextField('description').getText()?.includes('Replaced headlight'), true)
    assert.equal(form.getTextField('chargeable').getText() ?? '', '')
    assert.match(form.getTextField('generated-parts').getText() ?? '', /Headlight assembly/)
    assert.equal(form.getTextField('generated-technician-header').getText(), ': Mouhib')
    assert.equal(form.getTextField('generated-technician-footer').getText(), 'Mouhib')
    assert.equal(form.getTextField('generated-date-footer').getText(), '17/08/2026')
    assert.equal(form.getFields().length, 45)
})
