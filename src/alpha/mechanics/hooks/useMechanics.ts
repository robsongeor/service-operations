import { useCallback, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { fetchJobs } from '../../jobs/services/jobsApi'
import type { Job } from '../../jobs/types/job.types'
import type { Mechanic } from '../../jobs/types/mechanic.types'
import {
    createMechanic as createMechanicApi,
    fetchMechanics as fetchMechanicsApi,
    setMechanicActive as setMechanicActiveApi,
    updateMechanic as updateMechanicApi,
    type MechanicInput,
} from '../services/mechanicsApi'
import type { QualificationType, TechnicianQualification, TechnicianQualificationInput } from '../../wof/types/wof.types'
import { createTechnicianQualification as createQualificationApi, deactivateTechnicianQualification as deactivateQualificationApi, fetchAllTechnicianQualifications, fetchQualificationTypes, updateTechnicianQualification as updateQualificationApi } from '../../wof/services/qualificationApi'

export function useMechanics() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [mechanics, setMechanics] = useState<Mechanic[]>([])
    const [jobs, setJobs] = useState<Job[]>([])
    const [qualifications, setQualifications] = useState<TechnicianQualification[]>([])
    const [qualificationTypes, setQualificationTypes] = useState<QualificationType[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')

    const getToken = useCallback(async () => {
        if (!account) throw new Error('No active Microsoft account is available. Sign in again and retry.')
        const response = await instance.acquireTokenSilent({
            scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`],
            account,
        })
        return response.accessToken
    }, [account, instance])

    const load = useCallback(async () => {
        if (!account) return
        setIsLoading(true)
        setLoadError('')
        try {
            const token = await getToken()
            const [nextMechanics, nextJobs, nextQualifications, nextQualificationTypes] = await Promise.all([
                fetchMechanicsApi(token),
                fetchJobs(token),
                fetchAllTechnicianQualifications(token),
                fetchQualificationTypes(token),
            ])
            setMechanics(nextMechanics)
            setJobs(nextJobs)
            setQualifications(nextQualifications)
            setQualificationTypes(nextQualificationTypes)
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Mechanics could not be loaded.')
        } finally {
            setIsLoading(false)
        }
    }, [account, getToken])

    useEffect(() => {
        if (!account) return
        let cancelled = false
        const loadInitialData = async () => {
            setIsLoading(true)
            setLoadError('')
            try {
                const token = await getToken()
                const [nextMechanics, nextJobs, nextQualifications, nextQualificationTypes] = await Promise.all([
                    fetchMechanicsApi(token),
                    fetchJobs(token),
                    fetchAllTechnicianQualifications(token),
                    fetchQualificationTypes(token),
                ])
                if (!cancelled) {
                    setMechanics(nextMechanics)
                    setJobs(nextJobs)
                    setQualifications(nextQualifications)
                    setQualificationTypes(nextQualificationTypes)
                }
            } catch (error) {
                if (!cancelled) {
                    setLoadError(error instanceof Error ? error.message : 'Mechanics could not be loaded.')
                }
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        void loadInitialData()
        return () => { cancelled = true }
    }, [account, getToken])

    const mutate = async (action: (token: string) => Promise<void>) => {
        setIsSaving(true)
        setSaveError('')
        try {
            const token = await getToken()
            await action(token)
            await load()
        } catch (error) {
            const message = error instanceof Error ? error.message : 'The mechanic could not be saved.'
            setSaveError(message)
            throw error
        } finally {
            setIsSaving(false)
        }
    }

    return {
        mechanics,
        jobs,
        qualifications,
        qualificationTypes,
        isLoading,
        isSaving,
        loadError,
        saveError,
        reload: load,
        clearSaveError: () => setSaveError(''),
        createMechanic: async (input: MechanicInput) => {
            let created: Mechanic | undefined
            await mutate(async (token) => { created = await createMechanicApi(token, input) })
            return created!
        },
        updateMechanic: (mechanicId: string, input: MechanicInput) => mutate(
            (token) => updateMechanicApi(token, mechanicId, input),
        ),
        setMechanicActive: (mechanicId: string, active: boolean) => mutate(
            (token) => setMechanicActiveApi(token, mechanicId, active),
        ),
        createQualification: (input: TechnicianQualificationInput) => mutate((token) => createQualificationApi(token, input, qualifications, qualificationTypes)),
        updateQualification: (id: string, input: TechnicianQualificationInput) => mutate((token) => updateQualificationApi(token, id, input, qualifications, qualificationTypes)),
        deactivateQualification: (id: string) => mutate((token) => deactivateQualificationApi(token, id)),
    }
}
