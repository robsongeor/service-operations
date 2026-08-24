import { useEffect, useMemo, type ReactNode } from 'react'
import { OperationalDataClient, registerOperationalDataClient } from './OperationalDataClient'
import { OperationalDataClientContext } from './OperationalDataClientContext'

export function OperationalDataClientProvider({ scope, children }: { scope: string; children: ReactNode }) {
    const client = useMemo(() => new OperationalDataClient(scope), [scope])

    useEffect(() => {
        const unregister = registerOperationalDataClient(client)
        return () => {
            unregister()
            client.dispose()
        }
    }, [client])

    return <OperationalDataClientContext.Provider value={client}>{children}</OperationalDataClientContext.Provider>
}
