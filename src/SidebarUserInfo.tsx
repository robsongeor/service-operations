import { useMsal } from '@azure/msal-react'
import { getSignedInUserInfo } from './auth/signedInUser'

export default function SidebarUserInfo() {
    const { accounts } = useMsal()
    const user = getSignedInUserInfo(accounts[0])
    const displayName = user?.displayName || 'Signed in'
    const initial = displayName === 'Signed in' ? 'U' : displayName.charAt(0).toUpperCase()

    return (
        <span className="sidebar-user-info" title={displayName} aria-label={`Signed in as ${displayName}`}>
            <span className="sidebar-user-avatar" aria-hidden="true">{initial}</span>
            <span className="sidebar-user-name">{displayName}</span>
        </span>
    )
}
