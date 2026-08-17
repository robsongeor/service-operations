import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PDFDocument } from 'pdf-lib'
import { buildJobSheetValues, renderJobSheetPdf } from '../src/alpha/portal/jobSheetPdf.ts'
import { buildSubmittedJobSheet } from '../src/alpha/jobs/services/submittedJobSheetPdf.ts'
import type { Job } from '../src/alpha/jobs/types/job.types.ts'
import type { JobCardSubmission } from '../src/alpha/jobs/types/jobCardSubmission.types.ts'

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
