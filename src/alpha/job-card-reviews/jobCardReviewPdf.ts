import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { JobCardReview } from './jobCardReview.types.ts'

/** Saved evidence only: no current Job lookup, public token, photos or server writes. */
export async function renderJobCardReviewPdf(review: JobCardReview) {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    // Preserve unsupported characters visibly rather than silently dropping evidence.
    const printable = (value: string) => Array.from(value.replace(/\t/g, '    ')).map((char) => {
        if (char === '\n' || char === '\r') return char
        try { font.encodeText(char); return char } catch { return `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]` }
    }).join('')
    const title = `Job ${printable(review.jobNumber)} - saved technician submission`
    pdf.setTitle(title)
    pdf.setAuthor('Liftrucks NZ Ltd')
    let page = pdf.addPage([595.28, 841.89])
    let y = 786
    const newPage = () => { page = pdf.addPage([595.28, 841.89]); y = 786 }
    const line = (text: string, heading = false) => {
        if (y < 60) newPage()
        page.drawText(text, { x: 44, y, font: heading ? bold : font, size: heading ? 12 : 10, color: rgb(0.12, 0.17, 0.22) })
        y -= heading ? 21 : 15
    }
    const paragraph = (value: string, heading = false) => {
        const size = heading ? 12 : 10
        const face = heading ? bold : font
        for (const raw of printable(value).replace(/\r\n?/g, '\n').split('\n')) {
            let current = ''
            for (const char of raw) {
                if (face.widthOfTextAtSize(current + char, size) > 507) {
                    const space = current.lastIndexOf(' ')
                    line(space > 0 ? current.slice(0, space) : current, heading)
                    current = space > 0 ? current.slice(space + 1) : ''
                }
                current += char
            }
            line(current, heading)
        }
    }
    const section = (label: string, value: string) => {
        if (y < 110) newPage()
        y -= 10
        paragraph(label, true)
        paragraph(value || 'Not recorded')
    }
    paragraph('LIFTRUCKS NZ | JOB CARD', true)
    paragraph(title)
    paragraph(`Submission: ${review.reviewId}`)
    paragraph(`Submitted: ${review.submittedOn} | ${review.status === 'reviewed' ? 'Reviewed' : 'Pending office review'}`)
    paragraph('Saved Azure evidence. This report does not complete or update the operational Job.')
    section('Job snapshot', [
        `Customer: ${review.customerName || 'Not recorded'}`,
        `Site: ${review.siteName || 'Not recorded'}`,
        `Address: ${review.siteAddress || 'Not recorded'}`,
        `Order: ${review.orderNumber || 'Not recorded'}`,
        `Technician: ${review.technicianName || 'Not recorded'}`,
        `Equipment: ${review.equipmentDisplayName || 'Not recorded'}`,
        `Make / model: ${[review.equipmentMake, review.equipmentModel].filter(Boolean).join(' / ') || 'Not recorded'}`,
        `Fleet: ${review.fleetNumber || 'Not recorded'} | Serial: ${review.equipmentSerial || 'Not recorded'}`,
        `Submitted hour meter: ${review.hourMeter ?? 'Not supplied'}`,
    ].join('\n'))
    section('Work required', review.workRequired || '')
    section('Work completed', review.story)
    section('Time & travel (date / hours / kilometres)', review.timeEntries.map((entry) => `${entry.date} / ${entry.hours} h / ${entry.kilometres} km`).join('\n') || 'None recorded')
    paragraph(`Total: ${Number(review.timeEntries.reduce((sum, entry) => sum + entry.hours, 0).toFixed(2))} h / ${review.timeEntries.reduce((sum, entry) => sum + entry.kilometres, 0)} km`)
    section('Parts used (quantity x description)', review.parts.map((part) => `${part.quantity} x ${part.description}`).join('\n') || 'None recorded')
    section('Further work required', review.furtherWorkRequired ? review.furtherWorkDetails || 'Yes - details not supplied' : 'No')
    section('Safety issue identified', review.safetyIssueIdentified ? review.safetyIssueDetails || 'Yes - details not supplied' : 'No')
    section('Photo evidence', review.photos.length ? `Photos are not embedded. Open the authenticated review to view or download them.\n${review.photos.map((photo) => photo.fileName).join('\n')}` : 'None recorded')
    if (review.reviewedOn) section('Office review recorded', review.reviewedOn)
    pdf.getPages().forEach((item, index, pages) => item.drawText(`Saved Job Card evidence | Page ${index + 1} of ${pages.length}`, { x: 44, y: 30, font, size: 8, color: rgb(0.4, 0.4, 0.4) }))
    return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' })
}

export async function downloadJobCardReviewPdf(review: JobCardReview) {
    const blob = await renderJobCardReviewPdf(review)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `Job-${review.jobNumber.replace(/[^A-Za-z0-9._-]/g, '-')}-${review.reviewId}.pdf`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}
