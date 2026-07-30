import {
    BrowserAuthError,
    InteractionRequiredAuthError,
    type AccountInfo,
    type AuthenticationResult,
    type IPublicClientApplication,
} from '@azure/msal-browser'

export const DATAVERSE_SCOPES = [
    `${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`,
]
export const SILENT_AUTH_REDIRECT_URI = import.meta.env.VITE_MSAL_SILENT_REDIRECT_URI
    || window.location.origin
export const DATAVERSE_AUTH_REQUIRED_EVENT = 'dataverse-auth-required'

type PendingRecovery = {
    promise: Promise<AuthenticationResult>
    resolve: (result: AuthenticationResult) => void
}

let pendingRecovery: PendingRecovery | null = null

function authenticationNeedsInteraction(error: unknown) {
    return error instanceof InteractionRequiredAuthError
        || error instanceof BrowserAuthError && [
            'timed_out',
            'monitor_window_timeout',
            'token_renewal_error',
        ].includes(error.errorCode)
}

function waitForSessionRecovery() {
    if (!pendingRecovery) {
        let resolve!: (result: AuthenticationResult) => void
        const promise = new Promise<AuthenticationResult>((complete) => {
            resolve = complete
        })
        pendingRecovery = { promise, resolve }
        window.dispatchEvent(new Event(DATAVERSE_AUTH_REQUIRED_EVENT))
    }
    return pendingRecovery.promise
}

export async function acquireDataverseAccessToken(
    instance: IPublicClientApplication,
    account: AccountInfo | null,
    forceRefresh = false,
) {
    if (!account) throw new Error('No active Microsoft account is available. Sign in again and retry.')
    try {
        const response = await instance.acquireTokenSilent({
            scopes: DATAVERSE_SCOPES,
            account,
            forceRefresh,
            redirectUri: SILENT_AUTH_REDIRECT_URI,
        })
        return response.accessToken
    } catch (error) {
        if (!authenticationNeedsInteraction(error)) throw error
        return (await waitForSessionRecovery()).accessToken
    }
}

export async function reconnectDataverseSession(
    instance: IPublicClientApplication,
    account: AccountInfo | null,
) {
    if (!account) throw new Error('No active Microsoft account is available. Sign in again and retry.')
    const response = await instance.acquireTokenPopup({
        scopes: DATAVERSE_SCOPES,
        account,
        redirectUri: SILENT_AUTH_REDIRECT_URI,
    })
    const recovery = pendingRecovery
    pendingRecovery = null
    recovery?.resolve(response)
    return response.accessToken
}
