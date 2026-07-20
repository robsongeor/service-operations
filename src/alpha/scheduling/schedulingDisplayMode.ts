export const SCHEDULING_DISPLAY_MODE_KEY = 'service-operations.scheduling-display-mode.v1'

export type SchedulingDisplayMode = 'expanded' | 'compact' | 'today-expanded'

export const DEFAULT_SCHEDULING_DISPLAY_MODE: SchedulingDisplayMode = 'expanded'

export function restoreSchedulingDisplayMode(): SchedulingDisplayMode {
    try {
        const storedMode = sessionStorage.getItem(SCHEDULING_DISPLAY_MODE_KEY)
        return storedMode === 'expanded' || storedMode === 'compact' || storedMode === 'today-expanded'
            ? storedMode
            : DEFAULT_SCHEDULING_DISPLAY_MODE
    } catch {
        return DEFAULT_SCHEDULING_DISPLAY_MODE
    }
}
