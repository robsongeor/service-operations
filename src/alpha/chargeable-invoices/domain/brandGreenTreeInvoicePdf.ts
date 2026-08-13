import { PDFDocument } from 'pdf-lib'
import { LIFTRUCKS_INVOICE_LOGO_JPG_BASE64 } from './liftrucksInvoiceLogo.ts'

const LOGO_WIDTH_POINTS = 170
const LOGO_LEFT_POINTS = 38
const LOGO_TOP_POINTS = 20

function decodeBase64(value: string) {
    const binary = atob(value)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export async function brandGreenTreeInvoicePdf(source: Blob) {
    const sourceBuffer = await source.arrayBuffer()
    const signature = new Uint8Array(sourceBuffer, 0, Math.min(5, sourceBuffer.byteLength))
    if (signature.length < 5 || String.fromCharCode(...signature) !== '%PDF-') {
        throw new Error('Only a GreenTree PDF can be branded for customer evidence.')
    }
    const pdf = await PDFDocument.load(sourceBuffer, { updateMetadata: false })
    const logo = await pdf.embedJpg(decodeBase64(LIFTRUCKS_INVOICE_LOGO_JPG_BASE64))
    const logoHeight = LOGO_WIDTH_POINTS * (logo.height / logo.width)
    for (const page of pdf.getPages()) {
        const { height } = page.getSize()
        if (height < LOGO_TOP_POINTS + logoHeight) throw new Error('The GreenTree invoice page is too small for the letterhead logo.')
        page.drawImage(logo, {
            x: LOGO_LEFT_POINTS,
            y: height - LOGO_TOP_POINTS - logoHeight,
            width: LOGO_WIDTH_POINTS,
            height: logoHeight,
        })
    }
    const saved = await pdf.save()
    const output = new Uint8Array(saved.byteLength)
    output.set(saved)
    return new Blob([output.buffer], { type: 'application/pdf' })
}
