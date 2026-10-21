import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { getSignedInUserInfo } from '../../auth/signedInUser.ts'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount.ts'
import EditDrawerShell from '../shared/drawer/EditDrawerShell.tsx'
import { canUseWorkshopAssistant, WORKSHOP_ASSISTANT_REALTIME_ENABLED } from './domain/workshopAssistantAccess.ts'
import { useWorkshopAssistant } from './hooks/useWorkshopAssistant.ts'
import './WorkshopAssistant.css'

function connectionLabel(state: ReturnType<typeof useWorkshopAssistant>['state']) {
    if (state === 'connecting') return 'Connecting…'
    if (state === 'ready') return 'Ready'
    if (state === 'listening') return 'Listening…'
    if (state === 'error') return 'Needs attention'
    return 'Starts when you ask'
}

export default function WorkshopAssistantLauncher() {
    const account = useActiveMsalAccount()
    const user = getSignedInUserInfo(account)
    const available = canUseWorkshopAssistant(user) && WORKSHOP_ASSISTANT_REALTIME_ENABLED
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState('')
    const [pressing, setPressing] = useState(false)
    const messagesEnd = useRef<HTMLDivElement>(null)
    const assistant = useWorkshopAssistant()

    useEffect(() => {
        if (open) messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, [assistant.messages, open])

    if (!available) return null

    const submit = (event: FormEvent) => {
        event.preventDefault()
        const value = draft.trim()
        if (!value) return
        setDraft('')
        void assistant.sendText(value)
    }

    const startTalking = (event?: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
        event?.preventDefault()
        if (pressing) return
        setPressing(true)
        void assistant.beginPushToTalk().catch(() => setPressing(false))
    }

    const stopTalking = (event?: PointerEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
        event?.preventDefault()
        setPressing(false)
        assistant.endPushToTalk()
    }

    return <>
        <button
            type="button"
            className="workshop-assistant-launcher"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen(true)}
        >
            <span aria-hidden="true">AI</span>
            Workshop assistant
        </button>
        {open && <EditDrawerShell
            eyebrow="Private read-only pilot"
            title="Workshop assistant"
            className="workshop-assistant-drawer"
            onClose={() => setOpen(false)}
            headerAction={<button type="button" className="workshop-assistant-clear" onClick={assistant.clear}>Clear</button>}
            footer={<>
                <span className={`workshop-assistant-status ${assistant.state}`}>{connectionLabel(assistant.state)}</span>
                <button type="button" onClick={() => setOpen(false)}>Close</button>
            </>}
        >
            <div className="workshop-assistant-notice" role="note">
                Read-only. Answers come from records your signed-in account can access. No task, Job, Equipment, or transport record can be changed here.
            </div>
            <div className="workshop-assistant-messages" aria-live="polite" aria-label="Workshop assistant conversation">
                {assistant.messages.map((message) => <article key={message.id} className={`workshop-assistant-message ${message.role}`}>
                    <span>{message.role === 'user' ? 'You' : 'Assistant'}</span>
                    <p>{message.text}{message.pending && <i aria-label="Assistant is responding">…</i>}</p>
                </article>)}
                <div ref={messagesEnd} />
            </div>
            {assistant.sources.length > 0 && <section className="workshop-assistant-sources" aria-labelledby="workshop-assistant-sources-heading">
                <h3 id="workshop-assistant-sources-heading">Records checked</h3>
                <div>{assistant.sources.map((source) => <span key={`${source.kind}:${source.id}`} title={source.detail || source.label}>
                    {source.label}{source.detail ? <small>{source.detail}</small> : null}
                </span>)}</div>
            </section>}
            {assistant.error && <p className="workshop-assistant-error" role="alert">{assistant.error}</p>}
            <form className="workshop-assistant-composer" onSubmit={submit}>
                <label htmlFor="workshop-assistant-question">Ask about Equipment or a Job</label>
                <div>
                    <input
                        id="workshop-assistant-question"
                        value={draft}
                        maxLength={500}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="What is forklift 4582 here for?"
                    />
                    <button type="submit" disabled={!draft.trim() || assistant.state === 'connecting'}>Ask</button>
                </div>
            </form>
            <button
                type="button"
                className={`workshop-assistant-talk ${pressing ? 'active' : ''}`}
                aria-pressed={pressing}
                onPointerDown={startTalking}
                onPointerUp={stopTalking}
                onPointerCancel={stopTalking}
                onPointerLeave={stopTalking}
                onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') startTalking(event) }}
                onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') stopTalking(event) }}
            >
                <strong>{pressing ? 'Listening — release to stop' : 'Hold to talk'}</strong>
                <small>Microphone access is requested only when you press this button.</small>
            </button>
        </EditDrawerShell>}
    </>
}
