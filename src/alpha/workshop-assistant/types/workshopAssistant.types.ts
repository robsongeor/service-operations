export type WorkshopAssistantRole = 'user' | 'assistant'

export type WorkshopAssistantMessage = {
    id: string
    role: WorkshopAssistantRole
    text: string
    pending?: boolean
}

export type WorkshopAssistantSource = {
    kind: 'job' | 'equipment'
    id: string
    label: string
    detail?: string
}

export type WorkshopAssistantSession = {
    value: string
    expiresAt?: number
    model: string
    webrtcUrl: string
}

export type WorkshopAssistantConnectionState = 'idle' | 'connecting' | 'ready' | 'listening' | 'error'

export type WorkshopAssistantToolName =
    | 'search_equipment'
    | 'get_equipment_context'
    | 'search_jobs'
    | 'get_job_context'

export type WorkshopAssistantToolResult = {
    output: unknown
    sources: WorkshopAssistantSource[]
}
