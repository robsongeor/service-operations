import type { JobBookRow } from './jobBookPrototype'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL

type JobBookApiRow = {
    gr_jobid: string
    createdon: string
    gr_jobnumber: string | null
    gr_ordernumber: string | null
    gr_description: string | null
    gr_Equipment?: {
        gr_equipmentid: string
        gr_fleet: string | null
        gr_serial: string | null
        gr_make: string | null
        gr_model: string | null
    }
    gr_Mechanic?: { gr_mechanicid: string; gr_name: string }
    gr_Site?: {
        gr_name: string
        gr_address: string
        gr_Customer?: { gr_name: string }
    }
}

function localDate(isoDate: string) {
    return new Date(isoDate).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
}

export async function fetchRecentJobBookRows(accessToken: string): Promise<JobBookRow[]> {
    const select = 'gr_jobid,createdon,gr_jobnumber,gr_ordernumber,gr_description'
    const expand = 'gr_Equipment($select=gr_equipmentid,gr_fleet,gr_serial,gr_make,gr_model),gr_Mechanic($select=gr_mechanicid,gr_name),gr_Site($select=gr_name,gr_address;$expand=gr_Customer($select=gr_name))'
    const response = await fetch(`${DATAVERSE_URL}/api/data/v9.2/gr_jobs?$select=${select}&$expand=${expand}&$filter=gr_jobnumber ne null&$orderby=createdon desc&$top=100`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    })
    if (!response.ok) throw new Error('Recent Job Book entries could not be loaded.')
    const data = await response.json() as { value?: JobBookApiRow[] }
    return (data.value ?? []).map((job) => ({
        id: `dataverse-${job.gr_jobid}`,
        jobNumber: job.gr_jobnumber?.trim() ?? '',
        date: localDate(job.createdon),
        mechanicId: job.gr_Mechanic?.gr_mechanicid ?? '',
        mechanicName: job.gr_Mechanic?.gr_name ?? '',
        equipmentId: job.gr_Equipment?.gr_equipmentid ?? '',
        fleet: job.gr_Equipment?.gr_fleet?.trim() || job.gr_Equipment?.gr_serial?.trim() || '',
        serial: job.gr_Equipment?.gr_serial?.trim() ?? '',
        make: job.gr_Equipment?.gr_make?.trim() ?? '',
        model: job.gr_Equipment?.gr_model?.trim() ?? '',
        customer: job.gr_Site?.gr_Customer?.gr_name?.trim() ?? '',
        description: job.gr_description?.trim() ?? '',
        site: job.gr_Site?.gr_name?.trim() ?? '',
        address: job.gr_Site?.gr_address?.trim() ?? '',
        addressVerified: Boolean(job.gr_Site?.gr_address?.trim()),
        addressNotFoundConfirmed: false,
        customerPo: job.gr_ordernumber?.trim() ?? '',
        entered: false,
        timecloudEntered: false,
        equipmentConfigured: Boolean(job.gr_Equipment?.gr_fleet?.trim() || job.gr_Equipment?.gr_serial?.trim()),
        equipmentReviewRequired: false,
    }))
}
