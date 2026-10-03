import { useEffect, useRef, useState } from 'react'
import { JobRegistrationError, registerOrAllocateJob, type JobRegistrationCommand, type JobRegistrationResult } from '../services/jobRegistrationApi'
import { registrationAttemptStore } from '../services/jobRegistrationAttempt'

export function useJobRegistration(scope: string, getAccessToken: () => Promise<string>, enabled = true) {
    const store = () => registrationAttemptStore(window.sessionStorage, scope)
    const [initial] = useState(() => {
        if (!enabled) return { pending: null, error: '' }
        try { return { pending: store().read(), error: '' } }
        catch { return { pending: null, error: 'Saved request recovery is unavailable. Do not start another entry; check browser storage first.' } }
    })
    const [pending, setPending] = useState<JobRegistrationCommand | null>(initial.pending)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState(initial.error)
    const [conflict, setConflict] = useState(false)
    const inFlight = useRef(false)
    const notify = () => window.dispatchEvent(new CustomEvent('job-registration-recovery-changed', { detail: scope }))
    useEffect(() => {
        if (!enabled) return
        const refresh = (event: Event) => {
            if ((event as CustomEvent).detail !== scope) return
            try { setPending(registrationAttemptStore(window.sessionStorage, scope).read()) }
            catch { setError('Saved request recovery is unavailable. Check browser storage before proceeding.') }
        }
        window.addEventListener('job-registration-recovery-changed', refresh)
        return () => window.removeEventListener('job-registration-recovery-changed', refresh)
    }, [enabled, scope])
    const submit = async (command?: JobRegistrationCommand): Promise<JobRegistrationResult | undefined> => {
        if (inFlight.current || !enabled || initial.error) return
        inFlight.current = true
        setBusy(true)
        setError('')
        setConflict(false)
        let sent = false
        try {
            const retained = store().read()
            const request = retained ?? command
            if (!request) throw new Error('No registration request is ready.')
            const token = await getAccessToken()
            store().save(request)
            setPending(request)
            notify()
            sent = true
            const result = await registerOrAllocateJob(token, request)
            return result
        } catch (cause) {
            setConflict(cause instanceof JobRegistrationError && cause.kind === 'conflict')
            // Only a client-side validation/disabled result is safe to discard.
            // Server rejections, conflicts and unknown responses retain the command.
            if (sent && cause instanceof JobRegistrationError && ['invalid', 'disabled'].includes(cause.kind)) {
                store().clear()
                setPending(null)
                notify()
            }
            setError(cause instanceof Error ? cause.message : 'Registration could not be confirmed. Retry the retained request.')
        } finally {
            inFlight.current = false
            setBusy(false)
        }
    }
    const complete = () => { store().clear(); setPending(null); notify() }
    return { pending, busy, error, conflict, submit, complete }
}
