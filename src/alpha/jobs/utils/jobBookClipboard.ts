import { formatFleetNumbers } from '../../equipment/identifiers/alternateFleetNumbers.ts'
import type { Job } from '../types/job.types'

export const spreadsheetCell = (value?: string | null) =>
    (value ?? '').replace(/[\t\r\n]+/g, ' ').trim()

export type NumberedJobBookClipboardSource = {
    gr_jobnumber: string | null
    gr_Mechanic?: { gr_name: string }
    gr_Equipment?: { gr_fleet: string | null; gr_alternatefleetnumbers?: string | null }
    gr_Site?: { gr_Customer?: { gr_name: string } }
}

export const jobBookFleetCell = (job: Pick<NumberedJobBookClipboardSource, 'gr_Equipment'>) => spreadsheetCell(formatFleetNumbers(
    job.gr_Equipment?.gr_fleet,
    job.gr_Equipment?.gr_alternatefleetnumbers,
))

export const buildJobBookSpreadsheetRow = (job: Job) => {
    const addressParts = spreadsheetCell(job.gr_Site?.gr_address)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    const siteAddress = addressParts[0] ?? ''
    const siteSuburb = addressParts[1] ?? ''
    const siteCity = addressParts.slice(2).join(', ')
    return [
        job.gr_Mechanic?.gr_name,
        job.gr_Equipment?.gr_model,
        jobBookFleetCell(job),
        job.gr_Site?.gr_Customer?.gr_name,
        job.gr_description,
        siteAddress,
        siteSuburb,
        siteCity,
        job.gr_ordernumber,
    ].map(spreadsheetCell).join('\t')
}

export const copyJobBookSpreadsheetRow = async (job: Job) => {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
    await navigator.clipboard.writeText(buildJobBookSpreadsheetRow(job))
}

export const buildNumberedJobBookSpreadsheetRow = (job: NumberedJobBookClipboardSource, signedInUserName: string) => {
    const jobNumber = spreadsheetCell(job.gr_jobnumber)
    if (!jobNumber) return ''
    const mechanic = spreadsheetCell(job.gr_Mechanic?.gr_name)
    const copiedBy = spreadsheetCell(signedInUserName)
    if (!copiedBy) throw new Error('Sign in before copying to the order number book.')
    return [
        mechanic,
        jobNumber,
        jobBookFleetCell(job) || 'W/S',
        spreadsheetCell(job.gr_Site?.gr_Customer?.gr_name),
        '',
        copiedBy,
    ].join('\t') + '\n'
}

export const copyNumberedJobBookSpreadsheetRow = async (job: NumberedJobBookClipboardSource, signedInUserName: string) => {
    const row = buildNumberedJobBookSpreadsheetRow(job, signedInUserName)
    if (!row) throw new Error('A Job Number is required before this Job can be copied.')
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
    await navigator.clipboard.writeText(row)
}
