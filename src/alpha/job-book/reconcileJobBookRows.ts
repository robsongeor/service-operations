import type { JobBookRow } from './jobBookPrototype.ts'

/** Identity linkage only. A matching number is not permission to merge history. */
export function reconcileJobBookRows(ledgers: JobBookRow[], jobs: JobBookRow[]) {
    const linked = new Map(ledgers.filter((row) => row.registeredLedgerId && row.linkedJobId).map((row) => [row.linkedJobId.toLowerCase(), row]))
    return [...ledgers, ...jobs.filter((row) => !linked.has(row.linkedJobId.toLowerCase()))]
}
