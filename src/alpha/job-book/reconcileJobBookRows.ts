import type { JobBookRow } from './jobBookPrototype.ts'

/** Identity linkage only. A matching number is not permission to merge history. */
export function reconcileJobBookRows(ledgers: JobBookRow[], jobs: JobBookRow[]) {
    const linked = new Map(ledgers.filter((row) => row.registeredLedgerId && row.linkedJobId).map((row) => [row.linkedJobId.toLowerCase(), row]))
    const currentJobs = new Map(jobs.filter((row) => row.linkedJobId).map((row) => [row.linkedJobId.toLowerCase(), row]))
    const reconciledLedgers = ledgers.map((ledger) => {
        if (!ledger.registeredLedgerId || !ledger.linkedJobId) return ledger
        const job = currentJobs.get(ledger.linkedJobId.toLowerCase())
        if (!job) return ledger
        // The ledger remains the displayed/audited record. The direct Job read supplies
        // current concurrency and marker evidence that an expanded lookup may omit.
        return {
            ...ledger,
            etag: job.etag || ledger.etag,
            entered: job.entered,
            timecloudEntered: job.timecloudEntered,
        }
    })
    return [...reconciledLedgers, ...jobs.filter((row) => !linked.has(row.linkedJobId.toLowerCase()))]
}
