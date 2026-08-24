import { createContext, useContext } from 'react'
import type { OperationalDataClient } from './OperationalDataClient'

export const OperationalDataClientContext = createContext<OperationalDataClient | null>(null)

export function useOperationalDataClient() {
    const client = useContext(OperationalDataClientContext)
    if (!client) throw new Error('Operational Data Client is unavailable outside the authenticated app shell.')
    return client
}
