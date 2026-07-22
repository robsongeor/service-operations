import type { AccountInfo } from '@azure/msal-browser'

export type SignedInUserInfo = {
    storageId: string
    displayName: string
    username?: string
}

export function getSignedInUserInfo(account?: AccountInfo | null): SignedInUserInfo | null {
    if (!account) return null
    const stableId = account.homeAccountId || account.localAccountId || account.username
    if (!stableId) return null
    const username = account.username?.trim() || undefined
    return {
        storageId: encodeURIComponent(stableId),
        displayName: account.name?.trim() || username || 'Signed in',
        username,
    }
}
