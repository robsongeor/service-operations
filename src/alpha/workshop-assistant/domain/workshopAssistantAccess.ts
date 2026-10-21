import { isServiceOperationsAdministrator } from '../../../auth/adminAuthorization.ts'
import type { SignedInUserInfo } from '../../../auth/signedInUser.ts'

export const WORKSHOP_ASSISTANT_ENABLED = import.meta.env?.VITE_WORKSHOP_ASSISTANT_ENABLED === 'true'
export const WORKSHOP_ASSISTANT_REALTIME_ENABLED = import.meta.env?.VITE_WORKSHOP_ASSISTANT_REALTIME_ENABLED === 'true'

export function canUseWorkshopAssistant(
    user: SignedInUserInfo | null,
    enabled = WORKSHOP_ASSISTANT_ENABLED,
) {
    return enabled && isServiceOperationsAdministrator(user)
}
