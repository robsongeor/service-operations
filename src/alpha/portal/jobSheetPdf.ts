import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFTextField } from 'pdf-lib'
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
    .replace(/[^\x20-\x7e\r\n]/gu, (character) => `[U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}]`)
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

const fullDate = (value: Date) => new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: '2-digit', year: 'numeric' }).format(value)

const weekdayIndex = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) return null
    const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay()
    return day === 0 ? 7 : day
}

function wrapLines(value: string, width: number, font: PDFFont, size: number) {
    const lines: string[] = []
    for (const paragraph of ascii(value).replace(/\r\n?/g, '\n').split('\n')) {
        let current = ''
        for (const character of paragraph) {
            if (font.widthOfTextAtSize(current + character, size) > width) {
                const space = current.lastIndexOf(' ')
                lines.push(space > 0 ? current.slice(0, space) : current)
                current = space > 0 ? current.slice(space + 1) : ''
            }
            current += character
        }
        lines.push(current)
    }
    return lines
}

export function buildJobSheetValues(job: PublicJobSubmissionDetails, draft: JobSheetDraft) {
    const report = [
        job.workRequired ? `WORK REQUIRED\n${ascii(job.workRequired)}` : '',
        draft.story ? `WORK COMPLETED\n${ascii(draft.story)}` : '',
    ].filter(Boolean).join('\n\n')
    const parts = draft.parts
        .map((part) => `${part.quantity} x ${ascii(part.description)}`)
        .join('\n')
    const remarks = [
        draft.furtherWorkDetails ? `Further work: ${draft.furtherWorkDetails}` : '',
        draft.safetyIssueDetails ? `Safety issue: ${draft.safetyIssueDetails}` : '',
    ].filter(Boolean).map(ascii)
    const timeByDay = new Map<number, { date: string; hours: number; kilometres: number }>()
    const conflictingDays = new Set<number>()
    for (const entry of draft.timeEntries) {
        const index = weekdayIndex(entry.date)
        if (!index) continue
        const existing = timeByDay.get(index)
        if (existing && existing.date !== entry.date) conflictingDays.add(index)
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
        hours: inlineValue(draft.hourMeter ?? job.currentHourMeter),
        description: report,
        chargeable: parts,
        'FURTHER WORK REQUIRED  REMARKSRow1': remarks[0] ?? '',
        'FURTHER WORK REQUIRED  REMARKSRow2': remarks[1] ?? '',
        'FURTHER WORK REQUIRED  REMARKSRow3': remarks[2] ?? '',
    }
    for (let day = 1; day <= 7; day += 1) {
        const entry = timeByDay.get(day)
        values[`date-${day}`] = conflictingDays.has(day) ? 'See cont.' : entry ? shortDate(entry.date) : ''
        values[`hours-${day}`] = entry && !conflictingDays.has(day) ? ascii(Number(entry.hours.toFixed(2))) : ''
        values[day === 6 ? 'mileae-6' : `mileage-${day}`] = entry && !conflictingDays.has(day) ? ascii(entry.kilometres) : ''
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
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const form = pdf.getForm()
    const values = buildJobSheetValues(job, draft)
    const continuation: { label: string; value: string }[] = []
    // Fixed form boxes cannot grow. Use an explicit pointer and retain the whole section
    // on continuation pages instead of clipping text or shrinking it to illegibility.
    const fit = (label: string, value: string, width: number, height: number, size: number, multiline = false) => {
        const lines = wrapLines(value, width - 8, font, size)
        if ((multiline ? lines.length * size * 1.5 <= height - 8 : lines.length === 1)) return multiline ? lines.join('\n') : value
        continuation.push({ label, value })
        return font.widthOfTextAtSize('See continuation', size) <= width - 8 ? 'See continuation' : 'See cont.'
    }
    const labels: Record<string, string> = { job: 'Job number', fleet: 'Fleet number', orderNo: 'Order number', customer: 'Customer', 'customer-address': 'Customer / site address', 'site-contact': 'Site contact', 'site-contact-phone': 'Site contact phone', 'machine-make': 'Make', 'machine-model': 'Model', 'machine-serial': 'Serial number', hours: 'Submitted hour meter', description: 'Work required and completed' }
    for (const [name, value] of Object.entries(values)) {
        if (name === 'chargeable' || name.startsWith('FURTHER WORK')) continue
        const field = form.getTextField(name)
        const multiline = name === 'description'
        const fontSize = multiline ? 8 : 7.5
        const { width, height } = field.acroField.getWidgets()[0].getRectangle()
        const isTime = /^(date|hours|mileage|mileae)-/.test(name)
        setField(field, isTime ? value : fit(labels[name] || name, value, width, height, fontSize, multiline), isTime ? 6 : fontSize, multiline)
    }
    // The supplied artwork has its Saturday/Sunday date widgets reversed.
    const saturday = form.getTextField('date-6').acroField.getWidgets()[0]
    const sunday = form.getTextField('date-7').acroField.getWidgets()[0]
    const saturdayRect = saturday.getRectangle()
    saturday.setRectangle(sunday.getRectangle())
    sunday.setRectangle(saturdayRect)
    const remarks = [draft.furtherWorkDetails ? `Further work: ${draft.furtherWorkDetails}` : '', draft.safetyIssueDetails ? `Safety issue: ${draft.safetyIssueDetails}` : ''].filter(Boolean).join('\n')
    const remarkLines = wrapLines(remarks, 500, font, 8)
    if (remarkLines.length > 3) continuation.push({ label: 'Further work / safety issues', value: remarks })
    for (let row = 1; row <= 3; row += 1) setField(form.getTextField(`FURTHER WORK REQUIRED  REMARKSRow${row}`), remarkLines.length > 3 ? row === 1 ? 'See continuation - further work / safety issues' : '' : remarkLines[row - 1] || '', 8)
    const dayCounts = new Set(draft.timeEntries.map((entry) => weekdayIndex(entry.date)))
    if (dayCounts.has(null) || dayCounts.size < draft.timeEntries.length || Object.values(values).includes('See cont.')) {
        continuation.push({ label: 'Time and travel - every submitted entry', value: draft.timeEntries.map((entry) => `${entry.date} | ${entry.hours} h | ${entry.kilometres} km`).join('\n') })
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
        field.setText(fit(name === 'generated-parts' ? 'Parts used' : 'Technician', value, options.width, options.height, options.size, options.multiline))
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

    if (continuation.length) {
        page.drawText('Additional submitted details: see the attached Job card continuation pages.', { x: 38, y: 18, font, size: 7 })
        let extra = pdf.addPage([595.28, 841.89])
        let y = 750
        const heading = () => {
            extra.drawText(`Job ${ascii(job.jobNumber).slice(0, 45)} - Job card continuation`, { x: 40, y: 797, font: bold, size: 12 })
            extra.drawText('Continuation of the completed Field Service Inspection Report.', { x: 40, y: 777, font, size: 9 })
        }
        heading()
        const line = (text: string, isHeading = false) => {
            if (y < 55) { extra = pdf.addPage([595.28, 841.89]); y = 750; heading() }
            extra.drawText(text, { x: 40, y, font: isHeading ? bold : font, size: isHeading ? 10 : 9 })
            y -= isHeading ? 18 : 14
        }
        for (const section of continuation) {
            if (y < 100) y = 0
            line(section.label, true)
            for (const text of wrapLines(section.value, 515, font, 9)) line(text)
            y -= 14
        }
        pdf.getPages().slice(1).forEach((item, index) => item.drawText(`Job card continuation | Page ${index + 2} of ${pdf.getPageCount()}`, { x: 40, y: 28, font, size: 8 }))
    }

    return new Blob([new Uint8Array(await pdf.save({ useObjectStreams: false }))], { type: 'application/pdf' })
}

export async function loadJobSheetTemplate(signal?: AbortSignal) {
    const response = await fetch(TEMPLATE_URL, { cache: 'force-cache', signal })
    if (!response.ok) throw new Error('The Job sheet template could not be loaded.')
    return response.arrayBuffer()
}

export async function downloadJobSheetPdf(job: PublicJobSubmissionDetails, draft: JobSheetDraft, generatedAt?: Date) {
    const pdf = await renderJobSheetPdf(await loadJobSheetTemplate(), job, draft, generatedAt)
    const url = URL.createObjectURL(pdf)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `Job-${ascii(job.jobNumber).replace(/[^A-Za-z0-9._-]/g, '-') || 'sheet'}.pdf`
    anchor.click()
    URL.revokeObjectURL(url)
}
