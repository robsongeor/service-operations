import { createWorkshopAssistantSession } from '../services/workshopAssistantApi.ts'
import { runWorkshopAssistantTool } from '../services/workshopAssistantTools.ts'
import type { WorkshopAssistantConnectionState, WorkshopAssistantSource, WorkshopAssistantToolName } from '../types/workshopAssistant.types.ts'

type Callbacks = {
    onState: (state: WorkshopAssistantConnectionState) => void
    onUserTranscript: (text: string) => void
    onAssistantDelta: (text: string) => void
    onAssistantDone: (text?: string) => void
    onSources: (sources: WorkshopAssistantSource[]) => void
    onError: (message: string) => void
}

export type WorkshopAssistantRealtimeConnection = {
    hasMicrophone: boolean
    sendText: (text: string) => void
    beginPushToTalk: () => void
    endPushToTalk: () => void
    close: () => void
}

function parseJson(value: unknown): Record<string, unknown> {
    if (typeof value !== 'string') return {}
    try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch { return {} }
}

function eventText(event: Record<string, unknown>, ...names: string[]) {
    for (const name of names) {
        const value = event[name]
        if (typeof value === 'string' && value) return value
    }
    return ''
}

async function waitForIceGathering(peer: RTCPeerConnection) {
    if (peer.iceGatheringState === 'complete') return
    await new Promise<void>((resolve) => {
        const changed = () => {
            if (peer.iceGatheringState !== 'complete') return
            globalThis.clearTimeout(timeout)
            peer.removeEventListener('icegatheringstatechange', changed)
            resolve()
        }
        const timeout = globalThis.setTimeout(() => {
            peer.removeEventListener('icegatheringstatechange', changed)
            resolve()
        }, 2500)
        peer.addEventListener('icegatheringstatechange', changed)
    })
}

export async function connectWorkshopAssistantRealtime(options: {
    accessToken: string
    withMicrophone: boolean
    callbacks: Callbacks
    signal?: AbortSignal
}): Promise<WorkshopAssistantRealtimeConnection> {
    const { accessToken, callbacks, withMicrophone, signal } = options
    callbacks.onState('connecting')
    const session = await createWorkshopAssistantSession(accessToken, signal)
    const peer = new RTCPeerConnection()
    const audio = new Audio()
    audio.autoplay = true
    let media: MediaStream | undefined
    let microphone: MediaStreamTrack | undefined
    let closed = false
    const completedToolCalls = new Set<string>()

    peer.ontrack = (event) => {
        audio.srcObject = event.streams[0]
        void audio.play().catch(() => undefined)
    }
    if (withMicrophone) {
        try {
            media = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch (error) {
            peer.close()
            throw error
        }
        microphone = media.getAudioTracks()[0]
        if (!microphone) {
            media.getTracks().forEach((track) => track.stop())
            peer.close()
            throw new Error('No microphone is available.')
        }
        microphone.enabled = false
        peer.addTrack(microphone, media)
    } else {
        peer.addTransceiver('audio', { direction: 'recvonly' })
    }

    const channel = peer.createDataChannel('oai-events')
    const send = (event: Record<string, unknown>) => {
        if (channel.readyState !== 'open') throw new Error('The Workshop Assistant connection is not ready.')
        channel.send(JSON.stringify(event))
    }

    const executeTool = async (nameValue: unknown, callIdValue: unknown, argumentsValue: unknown) => {
        const name = typeof nameValue === 'string' ? nameValue : ''
        const callId = typeof callIdValue === 'string' ? callIdValue : ''
        if (!callId || completedToolCalls.has(callId)) return
        completedToolCalls.add(callId)
        try {
            if (!['search_equipment', 'get_equipment_context', 'search_jobs', 'get_job_context'].includes(name)) {
                throw new Error('That Workshop Assistant tool is not available.')
            }
            const result = await runWorkshopAssistantTool(accessToken, name as WorkshopAssistantToolName, parseJson(argumentsValue), signal)
            callbacks.onSources(result.sources)
            send({
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result.output) },
            })
        } catch (error) {
            send({
                type: 'conversation.item.create',
                item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify({ error: error instanceof Error ? error.message : 'The requested lookup failed.' }),
                },
            })
        }
        send({ type: 'response.create' })
    }

    channel.addEventListener('message', (message) => {
        const event = parseJson(message.data)
        const type = eventText(event, 'type')
        if (type === 'conversation.item.input_audio_transcription.completed' || type === 'conversation.item.input_audio_transcription.done') {
            const transcript = eventText(event, 'transcript', 'text').trim()
            if (transcript) callbacks.onUserTranscript(transcript)
            return
        }
        if (type === 'response.output_audio_transcript.delta' || type === 'response.output_audio.transcript.delta'
            || type === 'response.output_text.delta' || type === 'response.text.delta') {
            const delta = eventText(event, 'delta')
            if (delta) callbacks.onAssistantDelta(delta)
            return
        }
        if (type === 'response.output_audio_transcript.done' || type === 'response.output_audio.transcript.done'
            || type === 'response.output_text.done' || type === 'response.text.done') {
            callbacks.onAssistantDone(eventText(event, 'transcript', 'text'))
            return
        }
        if (type === 'response.function_call_arguments.done') {
            void executeTool(event.name, event.call_id, event.arguments)
            return
        }
        if (type === 'response.output_item.done') {
            const item = event.item as Record<string, unknown> | undefined
            if (item?.type === 'function_call') void executeTool(item.name, item.call_id, item.arguments)
            return
        }
        if (type === 'error') {
            const detail = event.error as Record<string, unknown> | undefined
            callbacks.onError(typeof detail?.message === 'string' ? detail.message : 'The Workshop Assistant reported an error.')
        }
    })

    peer.addEventListener('connectionstatechange', () => {
        if (closed) return
        if (peer.connectionState === 'connected') callbacks.onState('ready')
        if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
            callbacks.onState('error')
            callbacks.onError('The Workshop Assistant connection was interrupted.')
        }
    })

    const cleanup = () => {
        closed = true
        microphone?.stop()
        media?.getTracks().forEach((track) => track.stop())
        channel.close()
        peer.close()
        audio.pause()
        audio.srcObject = null
    }

    try {
        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        await waitForIceGathering(peer)
        const sdp = peer.localDescription?.sdp
        if (!sdp) throw new Error('The browser could not prepare the voice connection.')
        const response = await fetch(session.webrtcUrl, {
            method: 'POST',
            signal,
            headers: { Authorization: `Bearer ${session.value}`, 'Content-Type': 'application/sdp' },
            body: sdp,
        })
        if (!response.ok) throw new Error('Azure could not establish the Workshop Assistant session.')
        await peer.setRemoteDescription({ type: 'answer', sdp: await response.text() })
        await new Promise<void>((resolve, reject) => {
            if (channel.readyState === 'open') return resolve()
            const timeout = globalThis.setTimeout(() => reject(new Error('The Workshop Assistant connection timed out.')), 12_000)
            channel.addEventListener('open', () => { globalThis.clearTimeout(timeout); resolve() }, { once: true })
            channel.addEventListener('error', () => { globalThis.clearTimeout(timeout); reject(new Error('The Workshop Assistant data channel failed.')) }, { once: true })
        })
        callbacks.onState('ready')

        return {
            hasMicrophone: Boolean(microphone),
            sendText(value) {
                const text = value.trim()
                if (!text) return
                send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } })
                send({ type: 'response.create' })
            },
            beginPushToTalk() {
                if (!microphone) throw new Error('Reconnect with microphone access to use push-to-talk.')
                microphone.enabled = true
                callbacks.onState('listening')
            },
            endPushToTalk() {
                if (!microphone) return
                microphone.enabled = false
                callbacks.onState('ready')
            },
            close() {
                cleanup()
                callbacks.onState('idle')
            },
        }
    } catch (error) {
        cleanup()
        throw error
    }
}
