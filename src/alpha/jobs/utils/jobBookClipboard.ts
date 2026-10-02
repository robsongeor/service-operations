import { formatFleetNumbers } from '../../equipment/identifiers/alternateFleetNumbers'
import type { Job } from '../types/job.types'

export const spreadsheetCell = (value?: string | null) =>
    (value ?? '').replace(/[\t\r\n]+/g, ' ').trim()

export const jobBookFleetCell = (job: Job) => spreadsheetCell(formatFleetNumbers(
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

export const buildNumberedJobBookSpreadsheetRow = (job: Job) => {
    const jobNumber = spreadsheetCell(job.gr_jobnumber)
    if (!jobNumber) return ''
    const mechanic = spreadsheetCell(job.gr_Mechanic?.gr_name)
    return [
        mechanic,
        jobNumber,
        jobBookFleetCell(job) || 'W/S',
        spreadsheetCell(job.gr_Site?.gr_Customer?.gr_name),
        '',
        mechanic,
    ].join('\t') + '\n'
}

export const copyNumberedJobBookSpreadsheetRow = async (job: Job) => {
    const row = buildNumberedJobBookSpreadsheetRow(job)
    if (!row) throw new Error('A Job Number is required before this Job can be copied.')
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
    await navigator.clipboard.writeText(row)
}
