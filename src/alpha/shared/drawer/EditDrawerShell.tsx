import type { ReactNode } from 'react'
import './EditDrawer.css'

type Props = { eyebrow: string; title: string; busy?: boolean; children: ReactNode; footer: ReactNode; onClose: () => void }

export default function EditDrawerShell({ eyebrow, title, busy = false, children, footer, onClose }: Props) {
    return <div className="edit-drawer-backdrop" role="presentation" onMouseDown={() => { if (!busy) onClose() }}>
        <aside className="edit-drawer" role="dialog" aria-modal="true" aria-labelledby="edit-drawer-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="edit-drawer-header"><div><p>{eyebrow}</p><h2 id="edit-drawer-title">{title}</h2></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close edit drawer">×</button></header>
            <div className="edit-drawer-body">{children}</div>
            <footer className="edit-drawer-footer">{footer}</footer>
        </aside>
    </div>
}
