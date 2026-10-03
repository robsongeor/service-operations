import { useRef, useState } from 'react'
import { fetchJobBookIntakeRow, JobBookConflictError, voidJobBookIntakeRow } from './jobBookApi'
import { jobBookVoidBlockedReason } from './jobBookEntryWorkflow'
import type { JobBookRow } from './jobBookPrototype'

export function useJobBookVoid(getAccessToken: () => Promise<string>, onSaved: (row: JobBookRow) => void) {
    const [row, setRow] = useState<JobBookRow | null>(null)
    const [busy, setBusy] = useState(false)
    const busyRef = useRef(false)
    const [error, setError] = useState('')
    const [needsReload, setNeedsReload] = useState(false)
    const [notice, setNotice] = useState('')
    const open = (entry: JobBookRow) => {
        if (busyRef.current || jobBookVoidBlockedReason(entry)) return
        setRow(entry)
        setError('')
        setNeedsReload(false)
        setNotice('')
    }
    const close = () => { if (!busyRef.current) setRow(null) }
    const submit = async (reason: string) => {
        if (!row || busyRef.current || needsReload) return
        busyRef.current = true
        setBusy(true)
        setError('')
        try {
            const saved = await voidJobBookIntakeRow(await getAccessToken(), row, reason)
            onSaved(saved)
            setNotice(`Job Book ${saved.jobNumber} marked as void. Its number and recorded details have been retained.`)
            setRow(null)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The entry could not be marked as void.')
            setNeedsReload(cause instanceof JobBookConflictError)
        } finally {
            busyRef.current = false
            setBusy(false)
        }
    }
    const reload = async () => {
        if (!row || busyRef.current) return
        busyRef.current = true
        setBusy(true)
        setError('')
        try {
            const latest = await fetchJobBookIntakeRow(await getAccessToken(), row)
            onSaved(latest)
            setRow(latest)
            setNeedsReload(false)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The latest entry could not be loaded.')
        } finally {
            busyRef.current = false
            setBusy(false)
        }
    }
    return { row, busy, error, needsReload, notice, open, close, submit, reload }
}
