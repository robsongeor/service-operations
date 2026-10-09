import {
    completeEmbeddedAuthenticationResponse,
    showAuthenticationCallbackError,
} from './redirectBridge'

void completeEmbeddedAuthenticationResponse().catch(showAuthenticationCallbackError)
