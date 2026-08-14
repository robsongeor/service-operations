import { EventType, type AccountInfo } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { useEffect, useState } from 'react'

export function useActiveMsalAccount() {
    const { instance, accounts } = useMsal()
    const [activeAccount, setActiveAccount] = useState<AccountInfo | null>(() =>
        instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null)

    useEffect(() => {
        const resolveActiveAccount = () => {
            const availableAccounts = instance.getAllAccounts()
            setActiveAccount(instance.getActiveAccount() ?? availableAccounts[0] ?? null)
        }

        const callbackId = instance.addEventCallback(resolveActiveAccount, [
            EventType.ACTIVE_ACCOUNT_CHANGED,
            EventType.LOGIN_SUCCESS,
            EventType.LOGOUT_SUCCESS,
            EventType.HANDLE_REDIRECT_END,
        ])

        const currentAccount = instance.getActiveAccount()
        const nextAccount = currentAccount ?? accounts[0] ?? null

        if (!currentAccount && nextAccount) instance.setActiveAccount(nextAccount)
        setActiveAccount(nextAccount)

        return () => {
            if (callbackId) instance.removeEventCallback(callbackId)
        }
    }, [accounts, instance])

    // MsalProvider can expose the signed-in account one render before the
    // active-account effect runs after a redirect. Use that account immediately
    // so authenticated UI never briefly (or permanently) reports "Signed out".
    return accounts.length === 0 ? null : activeAccount ?? accounts[0]
}
