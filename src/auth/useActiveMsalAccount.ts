import { EventType, type AccountInfo } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { useEffect, useState } from 'react'

export function useActiveMsalAccount() {
    const { instance, accounts } = useMsal()
    const [activeAccount, setActiveAccount] = useState<AccountInfo | null>(() => instance.getActiveAccount())

    useEffect(() => {
        const resolveActiveAccount = () => setActiveAccount(instance.getActiveAccount())

        const callbackId = instance.addEventCallback(resolveActiveAccount, [
            EventType.ACTIVE_ACCOUNT_CHANGED,
            EventType.LOGIN_SUCCESS,
            EventType.LOGOUT_SUCCESS,
            EventType.HANDLE_REDIRECT_END,
        ])

        if (!instance.getActiveAccount() && accounts.length === 1) {
            instance.setActiveAccount(accounts[0])
        }

        return () => {
            if (callbackId) instance.removeEventCallback(callbackId)
        }
    }, [accounts, instance])

    return activeAccount
}
