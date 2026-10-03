import type { AccountInfo } from '@azure/msal-browser'

export const APPLICATION_ROLES = {
    FULL_ACCESS: 'ServiceOperations.FullAccess',
    JOB_BOOK_ONLY: 'ServiceOperations.JobBookOnly',
    JOB_CARD_ADMIN: 'ServiceOperations.JobCardAdmin',
} as const

export type ApplicationAccessMode = 'full' | 'job-book-only' | 'job-card-admin' | 'denied'
export type SimulatedAccessMode = ApplicationAccessMode | null

export type ApplicationAccess = {
    mode: ApplicationAccessMode
    canUseFullApplication: boolean
    canUseJobBook: boolean
    canManageJobs: boolean
    canCorrectJobDetails: boolean
    canEmailAssignedTechnician: boolean
    canReviewJobCards: boolean
    canViewQuotes: boolean
    canEditQuotes: boolean
    canViewEquipment: boolean
    canEditEquipment: boolean
    canMoveEquipment: boolean
    canCreateEquipmentDestination: boolean
    canViewCustomers: boolean
    canEditCustomers: boolean
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
    return normalized === 'full' || normalized === 'job-book-only' || normalized === 'job-card-admin' || normalized === 'denied'
        ? normalized
        : null
}

function accessForMode(mode: ApplicationAccessMode, isSimulated = false): ApplicationAccess {
    return {
        mode,
        canUseFullApplication: mode === 'full',
        canUseJobBook: mode === 'full' || mode === 'job-book-only' || mode === 'job-card-admin',
        // Service coordinators currently use FullAccess; Intake/Admin access is not Job management.
        canManageJobs: mode === 'full',
        canCorrectJobDetails: mode === 'full' || mode === 'job-card-admin',
        canEmailAssignedTechnician: mode === 'full' || mode === 'job-card-admin',
        canReviewJobCards: mode === 'full' || mode === 'job-card-admin',
        canViewQuotes: mode === 'full' || mode === 'job-card-admin',
        canEditQuotes: mode === 'full',
        canViewEquipment: mode === 'full' || mode === 'job-card-admin',
        canEditEquipment: mode === 'full',
        canMoveEquipment: mode !== 'denied',
        canCreateEquipmentDestination: mode !== 'denied',
        canViewCustomers: mode === 'full' || mode === 'job-card-admin',
        canEditCustomers: mode === 'full',
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
    if (roles.has(APPLICATION_ROLES.JOB_CARD_ADMIN.toLowerCase())) return accessForMode('job-card-admin')
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
