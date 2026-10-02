export const JOB_BOOK_KEYS = ['auckland', 'waikato', 'hastings', 'christchurch'] as const

export type JobBookKey = typeof JOB_BOOK_KEYS[number]

export type JobBookConfig = {
    key: JobBookKey
    label: string
    prefix: '' | 'WJ' | 'HJ' | 'CJ'
    autoNumberFormat: string
    tableLogicalName: string
    tableSetName: string
    idField: string
}

export const JOB_BOOKS: Record<JobBookKey, JobBookConfig> = {
    auckland: {
        key: 'auckland',
        label: 'Auckland',
        prefix: '',
        autoNumberFormat: '{SEQNUM:6}',
        tableLogicalName: 'gr_jobbookentry',
        tableSetName: 'gr_jobbookentries',
        idField: 'gr_jobbookentryid',
    },
    waikato: {
        key: 'waikato',
        label: 'Waikato',
        prefix: 'WJ',
        autoNumberFormat: 'WJ{SEQNUM:4}',
        tableLogicalName: 'gr_waikatojobbookentry',
        tableSetName: 'gr_waikatojobbookentries',
        idField: 'gr_waikatojobbookentryid',
    },
    hastings: {
        key: 'hastings',
        label: 'Hastings',
        prefix: 'HJ',
        autoNumberFormat: 'HJ{SEQNUM:5}',
        tableLogicalName: 'gr_hastingsjobbookentry',
        tableSetName: 'gr_hastingsjobbookentries',
        idField: 'gr_hastingsjobbookentryid',
    },
    christchurch: {
        key: 'christchurch',
        label: 'Christchurch',
        prefix: 'CJ',
        autoNumberFormat: 'CJ{SEQNUM:5}',
        tableLogicalName: 'gr_christchurchjobbookentry',
        tableSetName: 'gr_christchurchjobbookentries',
        idField: 'gr_christchurchjobbookentryid',
    },
}

const buildEnvironment = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env

export const REGIONAL_JOB_BOOKS_ENABLED = buildEnvironment?.VITE_REGIONAL_JOB_BOOKS_ENABLED === 'true'
export const REGIONAL_JOB_BOOK_ALLOCATION_ENABLED = buildEnvironment?.VITE_REGIONAL_JOB_BOOK_ALLOCATION_ENABLED === 'true'

export function availableJobBooks() {
    return REGIONAL_JOB_BOOKS_ENABLED
        ? JOB_BOOK_KEYS.map((key) => JOB_BOOKS[key])
        : [JOB_BOOKS.auckland]
}

export function jobNumberSequence(jobNumber: string) {
    const match = jobNumber.trim().toUpperCase().match(/^(?:WJ|HJ|CJ)?([0-9]+)$/)
    return match ? Number.parseInt(match[1], 10) : Number.NEGATIVE_INFINITY
}

export function jobNumberBelongsToBook(jobNumber: string, book: JobBookConfig) {
    const normalized = jobNumber.trim().toUpperCase()
    return book.prefix
        ? new RegExp(`^${book.prefix}[0-9]+$`).test(normalized)
        : /^[0-9]+$/.test(normalized)
}

export function managedJobNumberFilter(book: JobBookConfig) {
    if (book.prefix) return `startswith(gr_jobnumber,'${book.prefix}')`
    // Dataverse can return an empty result for chained `startswith(...) eq false`
    // clauses. Load the bounded numbered page and apply the exact Auckland
    // numeric-format check in jobNumberBelongsToBook instead.
    return 'gr_jobnumber ne null'
}
