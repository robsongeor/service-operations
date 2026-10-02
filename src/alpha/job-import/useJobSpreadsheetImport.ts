import { useCallback } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { useJobs } from '../jobs/hooks/useJobs'
import { createJobsAtomically } from '../jobs/services/jobsApi'
import type { JobSaveInput } from '../jobs/types/jobSave.types'

export function useJobSpreadsheetImport() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const jobsData = useJobs()

    const importJobs = useCallback(async (jobs: readonly JobSaveInput[]) => {
        const token = await acquireDataverseAccessToken(instance, account)
        await createJobsAtomically(token, jobs)
        await jobsData.fetchJobs()
    }, [account, instance, jobsData])

    return {
        jobs: jobsData.jobs,
        equipment: jobsData.equipmentList,
        mechanics: jobsData.mechanics,
        isLoading: jobsData.isLoading
            || jobsData.mechanicsLoading,
        error: jobsData.loadError || jobsData.mechanicsError || '',
        reload: async () => {
            await Promise.all([jobsData.fetchJobs(), jobsData.fetchEquipment()])
        },
        importJobs,
    }
}
