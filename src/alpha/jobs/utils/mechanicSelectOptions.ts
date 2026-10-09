import type { Mechanic } from '../types/mechanic.types'
import { canBeAssignedJobs } from '../../mechanics/staffDirectory.ts'

export const MECHANIC_SEARCH_LIMIT = 8
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

export type MechanicSelectOption = {
    kind: 'unassigned' | 'mechanic' | 'external'
    id: string
    name: string
    secondary: string
}

export function mechanicSelectOptions(mechanics: readonly Mechanic[], query: string, allowExternal = false): MechanicSelectOption[] {
    const search = normalize(query)
    const matches = mechanics.filter(canBeAssignedJobs)
        .filter((mechanic) => !search || normalize(`${mechanic.gr_name} ${mechanic.gr_email ?? ''} ${mechanic.gr_phone ?? ''}`).includes(search))
        .sort((a, b) => a.gr_name.localeCompare(b.gr_name))
        .slice(0, MECHANIC_SEARCH_LIMIT)
    return [
        ...(allowExternal ? [{ kind: 'external' as const, id: '', name: 'Other supplier', secondary: 'Enter supplier and booking details manually' }] : []),
        { kind: 'unassigned', id: '', name: 'Unassigned', secondary: 'Clear technician' },
        ...matches.map((mechanic): MechanicSelectOption => ({
            kind: 'mechanic', id: mechanic.gr_mechanicid, name: mechanic.gr_name,
            secondary: mechanic.gr_email || mechanic.gr_phone || '',
        })),
    ]
}
