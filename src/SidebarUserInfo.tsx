import { getSignedInUserInfo } from './auth/signedInUser'
import { useActiveMsalAccount } from './auth/useActiveMsalAccount'

export default function SidebarUserInfo() {
    const activeAccount = useActiveMsalAccount()
    const user = getSignedInUserInfo(activeAccount)
    const displayName = user?.displayName || 'Signed out'
    const initial = activeAccount ? displayName.charAt(0).toUpperCase() : 'U'

    return (
        <span className="sidebar-user-info" title={displayName} aria-label={activeAccount ? `Signed in as ${displayName}` : 'Signed out'}>
            <span className="sidebar-user-avatar" aria-hidden="true">{initial}</span>
            <span className="sidebar-user-name">{displayName}</span>
        </span>
    )
}
