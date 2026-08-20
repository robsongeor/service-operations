import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useMsal } from '@azure/msal-react'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { invalidateSharedEquipmentDataCache } from '../../equipment/services/equipmentDataCache'
import { publishEquipmentChange } from '../../equipment/services/equipmentRealtime'
import { invalidateSharedJobsDataCache } from '../../jobs/services/jobsDataCache'
import { publishJobChange } from '../../jobs/services/jobsRealtime'
import { publishStaffChange } from '../../mechanics/services/staffRealtime'
import { useOperationalDataClient } from '../data/OperationalDataClientContext'
import { startOperationalRealtime, type OperationalRealtimeStatus } from './operationalRealtime'
import {
    createOperationalCrossTabInvalidation,
    subscribeToLocalOperationalInvalidations,
} from './operationalCrossTabInvalidation'
import { publishOperationalRealtimeRecovery } from './operationalRealtimeEvents'
import { realtimeQueryDependsOn, type OperationalRealtimeResource } from './operationalRealtimeInvalidation'
import { OperationalRealtimeStatusContext } from './OperationalRealtimeStatusContext'

export default function OperationalRealtimeProvider({ children }: { children: ReactNode }) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const client = useOperationalDataClient()
    const [status, setStatus] = useState<OperationalRealtimeStatus>('disabled')
    const getAccessToken = useCallback(
        () => acquireDataverseAccessToken(instance, account),
        [account, instance],
    )

    useEffect(() => {
        const apiUrl = import.meta.env.VITE_EQUIPMENT_REALTIME_API_URL?.trim() ?? ''
        if (!account) return

        let stopped = false
        let invalidationTimer: number | undefined
        const pending = new Set<OperationalRealtimeResource>()

        const flushInvalidations = async () => {
            invalidationTimer = undefined
            if (stopped || pending.size === 0) return
            const refreshJobs = pending.has('jobs')
            const refreshEquipment = pending.has('equipment')
            const refreshQuotes = pending.has('quotes')
            pending.clear()
            try {
                const token = await getAccessToken()
                if (stopped) return
                if (refreshJobs) invalidateSharedJobsDataCache(token, { broadcast: false })
                if (refreshEquipment) invalidateSharedEquipmentDataCache(token, { broadcast: false })
            } catch {
                // Query invalidation below still refreshes active views and keeps the last usable data on failure.
            }
            if (stopped) return
            const resources = new Set<OperationalRealtimeResource>()
            if (refreshJobs) resources.add('jobs')
            if (refreshEquipment) resources.add('equipment')
            if (refreshQuotes) resources.add('quotes')
            client.invalidate((key) => realtimeQueryDependsOn(key, resources))
        }
        const scheduleInvalidation = (...resources: OperationalRealtimeResource[]) => {
            resources.forEach((resource) => pending.add(resource))
            if (invalidationTimer !== undefined) window.clearTimeout(invalidationTimer)
            invalidationTimer = window.setTimeout(() => { void flushInvalidations() }, 750)
        }
        const recover = (reason: 'reconnected' | 'visibility') => {
            scheduleInvalidation('jobs', 'equipment', 'quotes')
            publishOperationalRealtimeRecovery(reason)
        }
        const crossTab = createOperationalCrossTabInvalidation(client.scope, (resources) => {
            scheduleInvalidation(...resources)
        })
        const unsubscribeLocalInvalidations = subscribeToLocalOperationalInvalidations((resource) => {
            crossTab.publish([resource])
        })

        const stopRealtime = startOperationalRealtime({
            apiUrl,
            getAccessToken,
            onStatus: setStatus,
            onJobEvent: (event) => {
                const jobId = event.jobId.toLowerCase()
                client.invalidate((key) => key[0] === 'job' && key[1] === jobId)
                publishJobChange(event)
                scheduleInvalidation('jobs')
            },
            onEquipmentEvent: (event) => {
                const equipmentId = event.equipmentId.toLowerCase()
                client.invalidate((key) => key[0] === 'equipment' && key[1] === equipmentId)
                publishEquipmentChange(event)
                scheduleInvalidation('equipment')
            },
            onStaffEvent: publishStaffChange,
            onReconnected: () => recover('reconnected'),
        })
        const recoverWhenVisible = () => {
            if (document.visibilityState === 'visible') recover('visibility')
        }
        document.addEventListener('visibilitychange', recoverWhenVisible)

        return () => {
            stopped = true
            if (invalidationTimer !== undefined) window.clearTimeout(invalidationTimer)
            document.removeEventListener('visibilitychange', recoverWhenVisible)
            unsubscribeLocalInvalidations()
            crossTab.close()
            stopRealtime()
        }
    }, [account, client, getAccessToken])

    return <OperationalRealtimeStatusContext.Provider value={status}>{children}</OperationalRealtimeStatusContext.Provider>
}
