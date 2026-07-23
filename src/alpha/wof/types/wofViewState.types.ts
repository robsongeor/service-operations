export type WofSortKey = 'expiry' | 'rego-expiry' | 'customer'
export type WofSortDirection = 'ascending' | 'descending'
export type WofTablePreferences = { dueSoonDays: number; sort: { key: WofSortKey; direction: WofSortDirection } }

export const DEFAULT_WOF_PREFERENCES: WofTablePreferences = { dueSoonDays: WOF_DUE_SOON_DAYS, sort: { key: 'expiry', direction: 'ascending' } }
const key = (accountId: string) => `service-operations.wof-table-preferences.v1.${encodeURIComponent(accountId)}`

export function loadWofPreferences(accountId: string): WofTablePreferences {
    try {
        const parsed = JSON.parse(sessionStorage.getItem(key(accountId)) || '') as Partial<WofTablePreferences>
        const dueSoonDays = Number(parsed.dueSoonDays)
        const sortKey = parsed.sort?.key
        const direction = parsed.sort?.direction
        return {
            dueSoonDays: Number.isInteger(dueSoonDays) && dueSoonDays >= 1 && dueSoonDays <= 365 ? dueSoonDays : WOF_DUE_SOON_DAYS,
            sort: { key: sortKey === 'customer' || sortKey === 'expiry' || sortKey === 'rego-expiry' ? sortKey : 'expiry', direction: direction === 'descending' ? 'descending' : 'ascending' },
        }
    } catch { return DEFAULT_WOF_PREFERENCES }
}

export function saveWofPreferences(accountId: string, preferences: WofTablePreferences) {
    sessionStorage.setItem(key(accountId), JSON.stringify(preferences))
}
import { WOF_DUE_SOON_DAYS } from '../utils/wofRules'
