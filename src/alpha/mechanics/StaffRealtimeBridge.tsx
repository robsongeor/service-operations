import { useCallback, useEffect } from 'react'
import { useMsal } from '@azure/msal-react'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { publishStaffChange, startStaffRealtime } from './services/staffRealtime'

export default function StaffRealtimeBridge() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const getAccessToken = useCallback(
        () => acquireDataverseAccessToken(instance, account),
        [account, instance],
    )

    useEffect(() => {
        const apiUrl = import.meta.env.VITE_EQUIPMENT_REALTIME_API_URL?.trim() ?? ''
        if (!account || !apiUrl) return
        return startStaffRealtime({ apiUrl, getAccessToken, onEvent: publishStaffChange })
    }, [account, getAccessToken])

    return null
}
