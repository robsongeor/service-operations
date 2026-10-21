import { useCallback, useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication.ts'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount.ts'
import { canonicalizeWorkshopIdentifiers } from '../domain/workshopIdentifier.ts'
import { connectWorkshopAssistantRealtime, type WorkshopAssistantRealtimeConnection } from '../realtime/workshopAssistantRealtime.ts'
import type { WorkshopAssistantConnectionState, WorkshopAssistantMessage, WorkshopAssistantSource } from '../types/workshopAssistant.types.ts'

const welcome: WorkshopAssistantMessage = {
    id: 'welcome',
    role: 'assistant',
    text: 'Ask me about an Equipment record or Job. This private pilot is read-only and cannot change Service Operations data.',
}

function messageId() {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

export function useWorkshopAssistant() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [messages, setMessages] = useState<WorkshopAssistantMessage[]>([welcome])
    const [sources, setSources] = useState<WorkshopAssistantSource[]>([])
    const [state, setState] = useState<WorkshopAssistantConnectionState>('idle')
    const [error, setError] = useState('')
    const connection = useRef<WorkshopAssistantRealtimeConnection | null>(null)
    const pendingAssistantId = useRef('')
    const connecting = useRef<Promise<WorkshopAssistantRealtimeConnection> | null>(null)
    const pushToTalkRequested = useRef(false)

    const addUserMessage = useCallback((text: string) => {
        setMessages((current) => [...current, { id: messageId(), role: 'user', text }])
    }, [])

    const callbacks = useRef({
        onState: setState,
        onUserTranscript: (text: string) => addUserMessage(canonicalizeWorkshopIdentifiers(text)),
        onAssistantDelta(delta: string) {
            const id = pendingAssistantId.current || messageId()
            pendingAssistantId.current = id
            setMessages((current) => {
                const existing = current.find((message) => message.id === id)
                return existing
                    ? current.map((message) => message.id === id ? { ...message, text: message.text + delta, pending: true } : message)
                    : [...current, { id, role: 'assistant', text: delta, pending: true }]
            })
        },
        onAssistantDone(text?: string) {
            const id = pendingAssistantId.current
            pendingAssistantId.current = ''
            if (!id && text) {
                setMessages((current) => [...current, { id: messageId(), role: 'assistant', text }])
                return
            }
            if (id) setMessages((current) => current.map((message) => message.id === id ? { ...message, ...(text ? { text } : {}), pending: false } : message))
        },
        onSources(next: WorkshopAssistantSource[]) {
            setSources((current) => {
                const map = new Map(current.map((source) => [`${source.kind}:${source.id}`, source]))
                next.forEach((source) => map.set(`${source.kind}:${source.id}`, source))
                return [...map.values()].slice(-12)
            })
        },
        onError(message: string) { setError(message); setState('error') },
    })

    useEffect(() => {
        callbacks.current.onUserTranscript = (text: string) => addUserMessage(canonicalizeWorkshopIdentifiers(text))
    }, [addUserMessage])

    useEffect(() => () => connection.current?.close(), [])

    const ensureConnection = useCallback(async (withMicrophone: boolean) => {
        if (connection.current && (!withMicrophone || connection.current.hasMicrophone)) return connection.current
        if (connecting.current) return connecting.current
        connection.current?.close()
        connection.current = null
        setError('')
        const request = acquireDataverseAccessToken(instance, account)
            .then((accessToken) => connectWorkshopAssistantRealtime({ accessToken, withMicrophone, callbacks: callbacks.current }))
            .then((created) => {
                connection.current = created
                return created
            })
            .catch((cause) => {
                const message = cause instanceof Error ? cause.message : 'The Workshop Assistant could not start.'
                setError(message)
                setState('error')
                throw cause
            })
            .finally(() => { connecting.current = null })
        connecting.current = request
        return request
    }, [account, instance])

    const sendText = useCallback(async (value: string) => {
        const text = canonicalizeWorkshopIdentifiers(value).trim()
        if (!text) return
        addUserMessage(text)
        const active = await ensureConnection(false)
        active.sendText(text)
    }, [addUserMessage, ensureConnection])

    const beginPushToTalk = useCallback(async () => {
        pushToTalkRequested.current = true
        try {
            const active = await ensureConnection(true)
            if (pushToTalkRequested.current) active.beginPushToTalk()
        } catch (error) {
            pushToTalkRequested.current = false
            throw error
        }
    }, [ensureConnection])

    const endPushToTalk = useCallback(() => {
        pushToTalkRequested.current = false
        connection.current?.endPushToTalk()
    }, [])

    const clear = useCallback(() => {
        setMessages([welcome])
        setSources([])
        setError('')
        pendingAssistantId.current = ''
    }, [])

    return { messages, sources, state, error, sendText, beginPushToTalk, endPushToTalk, clear }
}
