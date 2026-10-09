import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge'

/**
 * MSAL Browser v5 no longer lets the opener poll the popup/iframe URL directly.
 * The redirect page must broadcast the authorization response back to the page
 * that started the interaction.
 */
export function completeEmbeddedAuthenticationResponse() {
    return broadcastResponseToMainFrame()
}

export function showAuthenticationCallbackError(error: unknown) {
    console.error('Microsoft authentication callback could not be completed.', error)

    const status = document.getElementById('auth-callback-status')
        ?? document.getElementById('root')
    if (!status) return

    status.textContent = 'Microsoft sign-in could not be completed. Close this window and try reconnecting again.'
    status.setAttribute('role', 'alert')
}
