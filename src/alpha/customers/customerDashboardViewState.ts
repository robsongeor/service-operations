export const CUSTOMER_DASHBOARD_VIEW_STATE_KEY_PREFIX = 'service-operations.customer-dashboard-view-state.v1'

type CustomerDashboardSelectionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function getCustomerDashboardViewStateKey(storageId: string) {
    return `${CUSTOMER_DASHBOARD_VIEW_STATE_KEY_PREFIX}.${storageId}`
}

export function restoreCustomerDashboardSelection(
    storageKey: string,
    storage: CustomerDashboardSelectionStorage = sessionStorage,
) {
    try {
        const raw = storage.getItem(storageKey)
        if (!raw) return ''
        const value = JSON.parse(raw) as { selectedCustomerId?: unknown } | null
        return typeof value?.selectedCustomerId === 'string' ? value.selectedCustomerId : ''
    } catch {
        return ''
    }
}

export function saveCustomerDashboardSelection(
    storageKey: string,
    selectedCustomerId: string,
    storage: CustomerDashboardSelectionStorage = sessionStorage,
) {
    try {
        if (!selectedCustomerId) {
            storage.removeItem(storageKey)
            return
        }
        storage.setItem(storageKey, JSON.stringify({ selectedCustomerId }))
    } catch {
        // Customer Dashboard remains usable when browser storage is unavailable.
    }
}
