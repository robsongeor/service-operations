export const JOBS_TABLE_COLUMNS = [
    { id: 'attention', label: 'Office attention', width: 40, selectable: false, flexible: false },
    { id: 'job', label: 'Job', width: 84, selectable: true, flexible: false },
    { id: 'created', label: 'Created', width: 94, selectable: true, flexible: false },
    { id: 'type', label: 'Type', width: 96, selectable: true, flexible: false },
    { id: 'equipment', label: 'Equipment', width: 136, selectable: true, flexible: false },
    { id: 'customer', label: 'Customer / site', width: 170, selectable: true, flexible: true },
    { id: 'description', label: 'Description', width: 185, selectable: true, flexible: true },
    { id: 'contact', label: 'Contact', width: 125, selectable: true, flexible: true },
    { id: 'mechanic', label: 'Mechanic', width: 160, selectable: true, flexible: true },
    { id: 'status', label: 'Status', width: 180, selectable: true, flexible: false },
    { id: 'order', label: 'Order', width: 100, selectable: true, flexible: false },
    { id: 'latestUpdate', label: 'Latest Update', width: 130, selectable: true, flexible: true },
    { id: 'actions', label: 'Actions', width: 190, selectable: false, flexible: false },
] as const

export type JobsTableColumnId = typeof JOBS_TABLE_COLUMNS[number]['id']
export type JobsStickyThroughColumnId = Exclude<JobsTableColumnId, 'attention' | 'actions'>

const selectableIds = new Set(JOBS_TABLE_COLUMNS.filter((column) => column.selectable).map((column) => column.id))
export const JOBS_TABLE_WIDTH = JOBS_TABLE_COLUMNS.reduce((total, column) => total + column.width, 0)
const actionsColumn = JOBS_TABLE_COLUMNS.find((column) => column.id === 'actions')
export const JOBS_TABLE_ACTIONS_WIDTH = actionsColumn!.width
const jobsTableFixedWidth = JOBS_TABLE_COLUMNS
    .filter((column) => !column.flexible)
    .reduce((total, column) => total + column.width, 0)
const jobsTableFlexibleWidth = JOBS_TABLE_WIDTH - jobsTableFixedWidth

export function isJobsStickyThroughColumnId(value: unknown): value is JobsStickyThroughColumnId {
    return typeof value === 'string' && selectableIds.has(value as JobsStickyThroughColumnId)
}

export function getJobsTableColumnWidths(availableWidth: number) {
    const tableWidth = Math.max(availableWidth, JOBS_TABLE_WIDTH)
    const availableFlexibleWidth = tableWidth - jobsTableFixedWidth
    return Object.fromEntries(JOBS_TABLE_COLUMNS.map((column) => [
        column.id,
        column.flexible
            ? availableFlexibleWidth * column.width / jobsTableFlexibleWidth
            : column.width,
    ])) as Record<JobsTableColumnId, number>
}

export function jobsTableColumnWidth(columnId: JobsTableColumnId, availableWidth = JOBS_TABLE_WIDTH) {
    const column = JOBS_TABLE_COLUMNS.find((candidate) => candidate.id === columnId)
    if (!column) return undefined
    return getJobsTableColumnWidths(availableWidth)[column.id]
}

export function jobsStickyColumnStyle(
    columnId: JobsTableColumnId,
    stickyThrough: JobsStickyThroughColumnId | null,
    columnWidths = getJobsTableColumnWidths(JOBS_TABLE_WIDTH),
) {
    if (!stickyThrough) return undefined
    const boundaryIndex = JOBS_TABLE_COLUMNS.findIndex((column) => column.id === stickyThrough)
    const columnIndex = JOBS_TABLE_COLUMNS.findIndex((column) => column.id === columnId)
    if (columnIndex < 0 || columnIndex > boundaryIndex) return undefined
    return {
        left: JOBS_TABLE_COLUMNS.slice(0, columnIndex)
            .reduce((total, column) => total + columnWidths[column.id], 0),
        width: columnWidths[columnId],
    }
}
