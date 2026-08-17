import { PDFDocument, StandardFonts, rgb, type PDFTextField } from 'pdf-lib'
import type { JobCardTimeEntryInput, PublicJobSubmissionDetails } from './jobSubmission.types'

const TEMPLATE_URL = new URL('../../../docs/templates/jobsheet-template.pdf', import.meta.url).href

export type JobSheetDraft = {
    hourMeter?: string
    story?: string
    timeEntries: JobCardTimeEntryInput[]
    parts: { description: string; quantity: number }[]
    furtherWorkDetails?: string
    safetyIssueDetails?: string
}

const ascii = (value?: string | number | null) => String(value ?? '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e\r\n]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()

const inlineValue = (value?: string | number | null) => {
    const normalized = ascii(value)
    return normalized ? ` ${normalized}` : ''
}

const shortDate = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    return match ? `${match[3]}/${match[2]}` : ascii(value).slice(0, 5)
}

const fullDate = (value: Date) => [
    String(value.getDate()).padStart(2, '0'),
    String(value.getMonth() + 1).padStart(2, '0'),
    value.getFullYear(),
].join('/')

const weekdayIndex = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) return null
    const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay()
    return day === 0 ? 7 : day
}

function wrapLines(value: string, maximumLineLength: number, maximumLines: number) {
    const words = ascii(value).split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let current = ''
    for (const word of words) {
        const next = current ? `${current} ${word}` : word
        if (next.length <= maximumLineLength) {
            current = next
            continue
        }
        if (current) lines.push(current)
        current = word.slice(0, maximumLineLength)
        if (lines.length >= maximumLines) break
    }
    if (current && lines.length < maximumLines) lines.push(current)
    return lines
}

export function buildJobSheetValues(job: PublicJobSubmissionDetails, draft: JobSheetDraft) {
    const report = [
        job.workRequired ? `WORK REQUIRED\n${ascii(job.workRequired)}` : '',
        draft.story ? `WORK COMPLETED\n${ascii(draft.story)}` : '',
    ].filter(Boolean).join('\n\n').slice(0, 3000)
    const parts = draft.parts
        .filter((part) => part.description.trim() && part.quantity > 0)
        .map((part) => `${part.quantity} x ${ascii(part.description)}`)
        .join('\n')
        .slice(0, 1800)
    const remarks = wrapLines([
        draft.furtherWorkDetails ? `Further work: ${draft.furtherWorkDetails}` : '',
        draft.safetyIssueDetails ? `Safety issue: ${draft.safetyIssueDetails}` : '',
    ].filter(Boolean).join(' | '), 105, 3)
    const timeByDay = new Map<number, { date: string; hours: number; kilometres: number }>()
    for (const entry of draft.timeEntries) {
        const index = weekdayIndex(entry.date)
        if (!index) continue
        const existing = timeByDay.get(index)
        timeByDay.set(index, {
            date: entry.date,
            hours: (existing?.hours ?? 0) + entry.hours,
            kilometres: (existing?.kilometres ?? 0) + entry.kilometres,
        })
    }
    const values: Record<string, string> = {
        job: inlineValue(job.jobNumber),
        fleet: inlineValue(job.fleetNumber),
        orderNo: inlineValue(job.orderNumber),
        customer: inlineValue(job.customerName),
        'customer-address': ascii([job.siteName, job.siteAddress].filter(Boolean).join(' - ')),
        'site-contact': inlineValue(job.siteContactName),
        'site-contact-phone': inlineValue(job.siteContactPhone),
        'machine-make': inlineValue(job.equipmentMake),
        'machine-model': inlineValue(job.equipmentModel),
        'machine-serial': inlineValue(job.equipmentSerial),
        hours: inlineValue(draft.hourMeter || job.currentHourMeter),
        description: report,
        chargeable: parts,
        'FURTHER WORK REQUIRED  REMARKSRow1': remarks[0] ?? '',
        'FURTHER WORK REQUIRED  REMARKSRow2': remarks[1] ?? '',
        'FURTHER WORK REQUIRED  REMARKSRow3': remarks[2] ?? '',
    }
    for (let day = 1; day <= 7; day += 1) {
        const entry = timeByDay.get(day)
        values[`date-${day}`] = entry ? shortDate(entry.date) : ''
        values[`hours-${day}`] = entry ? ascii(Number(entry.hours.toFixed(2))) : ''
        values[day === 6 ? 'mileae-6' : `mileage-${day}`] = entry ? ascii(entry.kilometres) : ''
    }
    return values
}

function setField(field: PDFTextField, value: string, fontSize: number, multiline = false) {
    if (multiline) field.enableMultiline()
    field.setText(value)
    field.setFontSize(fontSize)
}

export async function renderJobSheetPdf(
    templateBytes: ArrayBuffer | Uint8Array,
    job: PublicJobSubmissionDetails,
    draft: JobSheetDraft,
    generatedAt = new Date(),
) {
    const pdf = await PDFDocument.load(templateBytes, { updateMetadata: false })
    pdf.setTitle(`Job ${ascii(job.jobNumber)} - Field Service Inspection Report`)
    pdf.setAuthor('Liftrucks NZ Ltd')
    pdf.setCreator('Service Operations')
    pdf.setCreationDate(generatedAt)
    pdf.setModificationDate(generatedAt)
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const form = pdf.getForm()
    const values = buildJobSheetValues(job, draft)
    for (const [name, value] of Object.entries(values)) {
        const field = form.getTextField(name)
        const multiline = name === 'description' || name === 'chargeable'
        const fontSize = multiline ? 8 : name.startsWith('FURTHER WORK') ? 8 : 7.5
        setField(field, value, fontSize, multiline)
    }
    const page = pdf.getPage(0)
    const white = rgb(1, 1, 1)
    const black = rgb(0, 0, 0)
    const technicianName = ascii(job.technicianName || 'Technician')
    const overlay = (
        name: string,
        value: string,
        options: { x: number; y: number; width: number; height: number; size: number; multiline?: boolean },
    ) => {
        const field = form.createTextField(name)
        if (options.multiline) field.enableMultiline()
        field.addToPage(page, {
            x: options.x,
            y: options.y,
            width: options.width,
            height: options.height,
            borderWidth: 0,
            backgroundColor: white,
            textColor: black,
            font,
        })
        field.setText(value)
        field.setFontSize(options.size)
    }

    // The supplied legacy artwork has no field in its Parts box and contains fixed technician/date
    // text. Add editable white-backed fields over only those legacy values and empty areas.
    form.getTextField('chargeable').setText('')
    overlay('generated-parts', values.chargeable, {
        x: 212, y: 228, width: 342, height: 158, size: 8, multiline: true,
    })
    overlay('generated-technician-header', `: ${technicianName}`, { x: 309, y: 768.5, width: 247, height: 15, size: 9 })
    overlay('generated-technician-footer', technicianName, { x: 419, y: 91, width: 137, height: 14, size: 8.5 })
    overlay('generated-date-footer', fullDate(generatedAt), { x: 419, y: 70, width: 137, height: 14, size: 8.5 })
    form.updateFieldAppearances(font)

    return new Blob([new Uint8Array(await pdf.save({ useObjectStreams: false }))], { type: 'application/pdf' })
}

export async function downloadJobSheetPdf(job: PublicJobSubmissionDetails, draft: JobSheetDraft, generatedAt?: Date) {
    const response = await fetch(TEMPLATE_URL, { cache: 'force-cache' })
    if (!response.ok) throw new Error('The Job sheet template could not be loaded.')
    const pdf = await renderJobSheetPdf(await response.arrayBuffer(), job, draft, generatedAt)
    const url = URL.createObjectURL(pdf)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `Job-${ascii(job.jobNumber).replace(/[^A-Za-z0-9._-]/g, '-') || 'sheet'}.pdf`
    anchor.click()
    URL.revokeObjectURL(url)
}
