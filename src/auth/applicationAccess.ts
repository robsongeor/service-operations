import type { AccountInfo } from '@azure/msal-browser'

export const APPLICATION_ROLES = {
    FULL_ACCESS: 'ServiceOperations.FullAccess',
    JOB_BOOK_ONLY: 'ServiceOperations.JobBookOnly',
} as const

export type ApplicationAccessMode = 'full' | 'job-book-only' | 'denied'
export type SimulatedAccessMode = ApplicationAccessMode | null

export type ApplicationAccess = {
    mode: ApplicationAccessMode
    canUseFullApplication: boolean
    canUseJobBook: boolean
    isSimulated: boolean
}

type ResolveApplicationAccessOptions = {
    enforceAccessControl: boolean
    isDevelopment: boolean
    simulatedMode?: string | null
}

function roleClaims(account?: AccountInfo | null) {
    const claims = account?.idTokenClaims as Record<string, unknown> | undefined
    return Array.isArray(claims?.roles)
        ? claims.roles.filter((role): role is string => typeof role === 'string')
        : []
}

export function parseSimulatedAccessMode(value?: string | null): SimulatedAccessMode {
    const normalized = value?.trim().toLowerCase()
    return normalized === 'full' || normalized === 'job-book-only' || normalized === 'denied'
        ? normalized
        : null
}

function accessForMode(mode: ApplicationAccessMode, isSimulated = false): ApplicationAccess {
    return {
        mode,
        canUseFullApplication: mode === 'full',
        canUseJobBook: mode === 'full' || mode === 'job-book-only',
        isSimulated,
    }
}

export function resolveApplicationAccess(
    account: AccountInfo | null | undefined,
    options: ResolveApplicationAccessOptions,
): ApplicationAccess {
    const simulatedMode = options.isDevelopment
        ? parseSimulatedAccessMode(options.simulatedMode)
        : null
    if (simulatedMode) return accessForMode(simulatedMode, true)

    // Access enforcement is opt-in so deploying the client code cannot lock out the existing
    // workforce before the Entra application roles and Dataverse roles are assigned.
    if (!options.enforceAccessControl) return accessForMode('full')

    const roles = new Set(roleClaims(account).map((role) => role.toLowerCase()))
    if (roles.has(APPLICATION_ROLES.FULL_ACCESS.toLowerCase())) return accessForMode('full')
    if (roles.has(APPLICATION_ROLES.JOB_BOOK_ONLY.toLowerCase())) return accessForMode('job-book-only')
    return accessForMode('denied')
}

export function applicationAccessFromEnvironment(account?: AccountInfo | null) {
    return resolveApplicationAccess(account, {
        enforceAccessControl: import.meta.env.VITE_APPLICATION_ACCESS_CONTROL_ENABLED === 'true',
        isDevelopment: import.meta.env.DEV,
        simulatedMode: import.meta.env.VITE_SIMULATED_ACCESS_MODE,
    })
}
