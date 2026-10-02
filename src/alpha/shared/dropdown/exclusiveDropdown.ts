const EXCLUSIVE_DROPDOWN_OPEN_EVENT = 'service-operations:exclusive-dropdown-open'

export function announceExclusiveDropdownOpen(ownerId: string) {
    document.dispatchEvent(new CustomEvent(EXCLUSIVE_DROPDOWN_OPEN_EVENT, { detail: ownerId }))
}

export function closeWhenAnotherDropdownOpens(ownerId: string, close: () => void) {
    const listener = (event: Event) => {
        if ((event as CustomEvent<string>).detail !== ownerId) close()
    }
    document.addEventListener(EXCLUSIVE_DROPDOWN_OPEN_EVENT, listener)
    return () => document.removeEventListener(EXCLUSIVE_DROPDOWN_OPEN_EVENT, listener)
}
