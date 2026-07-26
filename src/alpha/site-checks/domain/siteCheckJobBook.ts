import type { SiteCheckDetailJob } from '../types/siteCheck.types.ts'

export type SiteCheckJobNumberAllocation = {
    job: SiteCheckDetailJob
    jobNumber: string
}

function spreadsheetCell(value?: string | null) {
    return (value ?? '').replace(/[\t\r\n]+/g, ' ').trim()
}

export function buildSiteCheckJobBookRows(
    jobs: readonly SiteCheckDetailJob[],
    customerName: string,
    siteAddress?: string | null,
) {
    const addressParts = spreadsheetCell(siteAddress)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    const address = addressParts[0] ?? ''
    const suburb = addressParts[1] ?? ''
    const city = addressParts.slice(2).join(', ')

    return jobs.map((job) => [
        job.gr_Mechanic?.gr_name,
        job.gr_Equipment?.gr_model,
        job.gr_Equipment?.gr_fleet,
        customerName,
        job.gr_description,
        address,
        suburb,
        city,
    ].map(spreadsheetCell).join('\t')).join('\n')
}

export function parseSiteCheckJobNumbers(
    input: string,
    jobs: readonly SiteCheckDetailJob[],
): SiteCheckJobNumberAllocation[] {
    const jobNumbers = input.replace(/\r/g, '').split('\n').map((value) => value.trim())
    while (jobNumbers.at(-1) === '') jobNumbers.pop()

    if (jobNumbers.some((value) => !value)) {
        throw new Error('Remove blank lines between Job numbers and try again.')
    }
    if (jobNumbers.length !== jobs.length) {
        throw new Error(
            `Paste exactly ${jobs.length} Job numbers. ${jobNumbers.length} were found.`,
        )
    }
    if (jobNumbers.some((value) => !/^\d+$/.test(value))) {
        throw new Error('Job numbers must contain digits only, one number per line.')
    }
    if (new Set(jobNumbers).size !== jobNumbers.length) {
        throw new Error('Each pasted Job number must be unique.')
    }

    return jobs.map((job, index) => ({ job, jobNumber: jobNumbers[index] }))
}
