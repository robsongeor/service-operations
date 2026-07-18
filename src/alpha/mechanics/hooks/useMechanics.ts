import { useCallback, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
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

export function useMechanics() {
    const { instance, accounts } = useMsal()
    const account = accounts[0]
    const [mechanics, setMechanics] = useState<Mechanic[]>([])
    const [jobs, setJobs] = useState<Job[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')

    const getToken = useCallback(async () => {
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
            const [nextMechanics, nextJobs] = await Promise.all([
                fetchMechanicsApi(token),
                fetchJobs(token),
            ])
            setMechanics(nextMechanics)
            setJobs(nextJobs)
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
                const [nextMechanics, nextJobs] = await Promise.all([
                    fetchMechanicsApi(token),
                    fetchJobs(token),
                ])
                if (!cancelled) {
                    setMechanics(nextMechanics)
                    setJobs(nextJobs)
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
        isLoading,
        isSaving,
        loadError,
        saveError,
        reload: load,
        clearSaveError: () => setSaveError(''),
        createMechanic: (input: MechanicInput) => mutate((token) => createMechanicApi(token, input)),
        updateMechanic: (mechanicId: string, input: MechanicInput) => mutate(
            (token) => updateMechanicApi(token, mechanicId, input),
        ),
        setMechanicActive: (mechanicId: string, active: boolean) => mutate(
            (token) => setMechanicActiveApi(token, mechanicId, active),
        ),
    }
}
