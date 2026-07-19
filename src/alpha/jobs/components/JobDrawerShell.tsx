import type { ReactNode } from 'react'
import EditDrawerShell from '../../shared/drawer/EditDrawerShell'

type Props = {
    eyebrow: string
    title: string
    busy?: boolean
    children: ReactNode
    footer: ReactNode
    headerAction?: ReactNode
    onClose: () => void
}

export default function JobDrawerShell(props: Props) {
    return <EditDrawerShell {...props} />
}
