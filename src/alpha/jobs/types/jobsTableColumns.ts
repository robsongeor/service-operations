export const JOBS_TABLE_COLUMNS = [
    { id: 'attention', label: 'Office attention', width: 40, selectable: false },
    { id: 'job', label: 'Job', width: 84, selectable: true },
    { id: 'created', label: 'Created', width: 94, selectable: true },
    { id: 'type', label: 'Type', width: 96, selectable: true },
    { id: 'equipment', label: 'Equipment', width: 136, selectable: true },
    { id: 'customer', label: 'Customer / site', width: 170, selectable: true },
    { id: 'description', label: 'Description', width: 185, selectable: true },
    { id: 'contact', label: 'Contact', width: 125, selectable: true },
    { id: 'mechanic', label: 'Mechanic', width: 160, selectable: true },
    { id: 'status', label: 'Status', width: 148, selectable: true },
    { id: 'order', label: 'Order', width: 100, selectable: true },
    { id: 'latestUpdate', label: 'Latest Update', width: 130, selectable: true },
    { id: 'actions', label: 'Actions', width: 132, selectable: false },
] as const

export type JobsTableColumnId = typeof JOBS_TABLE_COLUMNS[number]['id']
export type JobsStickyThroughColumnId = Exclude<JobsTableColumnId, 'attention' | 'actions'>

const selectableIds = new Set(JOBS_TABLE_COLUMNS.filter((column) => column.selectable).map((column) => column.id))

export function isJobsStickyThroughColumnId(value: unknown): value is JobsStickyThroughColumnId {
    return typeof value === 'string' && selectableIds.has(value as JobsStickyThroughColumnId)
}

export function jobsStickyColumnStyle(columnId: JobsTableColumnId, stickyThrough: JobsStickyThroughColumnId | null) {
    if (!stickyThrough) return undefined
    const boundaryIndex = JOBS_TABLE_COLUMNS.findIndex((column) => column.id === stickyThrough)
    const columnIndex = JOBS_TABLE_COLUMNS.findIndex((column) => column.id === columnId)
    if (columnIndex < 0 || columnIndex > boundaryIndex) return undefined
    return {
        left: JOBS_TABLE_COLUMNS.slice(0, columnIndex).reduce((total, column) => total + column.width, 0),
    }
}
