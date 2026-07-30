import { useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from './useActiveMsalAccount'
import {
    DATAVERSE_AUTH_REQUIRED_EVENT,
    reconnectDataverseSession,
} from './dataverseAuthentication'
import './DataverseSessionRecovery.css'

export default function DataverseSessionRecovery() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [open, setOpen] = useState(false)
    const [isReconnecting, setIsReconnecting] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        const requireAuthentication = () => {
            setError('')
            setOpen(true)
        }
        window.addEventListener(DATAVERSE_AUTH_REQUIRED_EVENT, requireAuthentication)
        return () => window.removeEventListener(DATAVERSE_AUTH_REQUIRED_EVENT, requireAuthentication)
    }, [])

    if (!open) return null

    const reconnect = async () => {
        setIsReconnecting(true)
        setError('')
        try {
            await reconnectDataverseSession(instance, account)
            setOpen(false)
        } catch (caught) {
            setError(caught instanceof Error
                ? caught.message
                : 'Microsoft sign-in could not be completed. Please try again.')
        } finally {
            setIsReconnecting(false)
        }
    }

    return <div className="dataverse-session-backdrop" role="presentation">
        <section className="dataverse-session-dialog" role="alertdialog" aria-modal="true" aria-labelledby="dataverse-session-title">
            <span aria-hidden="true">!</span>
            <div>
                <p>Microsoft session expired</p>
                <h2 id="dataverse-session-title">Reconnect to continue</h2>
                <p>Your current page will remain open. Sign in again and the interrupted Dataverse request will continue automatically.</p>
            </div>
            {error && <p className="dataverse-session-error" role="alert">{error}</p>}
            <button type="button" onClick={() => void reconnect()} disabled={isReconnecting}>
                {isReconnecting ? 'Connecting…' : 'Reconnect Microsoft'}
            </button>
        </section>
    </div>
}
