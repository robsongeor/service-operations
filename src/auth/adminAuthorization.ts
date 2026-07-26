import type { SignedInUserInfo } from './signedInUser.ts'

export const SERVICE_OPERATIONS_ADMIN_EMAIL = 'georger@liftrucks.co.nz'

export function isServiceOperationsAdministrator(user: SignedInUserInfo | null) {
    return user?.username?.trim().toLowerCase() === SERVICE_OPERATIONS_ADMIN_EMAIL
}
