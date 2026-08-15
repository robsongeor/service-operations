export const EQUIPMENT_PAGE_SIZE = 100

export function paginateEquipmentRows<T>(rows: readonly T[], requestedPage: number, pageSize = EQUIPMENT_PAGE_SIZE) {
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
    const page = Math.min(Math.max(1, Math.trunc(requestedPage) || 1), totalPages)
    const start = (page - 1) * pageSize
    return {
        page,
        totalPages,
        start,
        end: Math.min(start + pageSize, rows.length),
        rows: rows.slice(start, start + pageSize),
    }
}
