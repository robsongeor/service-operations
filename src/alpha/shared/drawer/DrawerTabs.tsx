import './DrawerTabs.css'
import type { KeyboardEvent } from 'react'

export type DrawerTab<T extends string> = { id: T; label: string; hasError?: boolean }

type Props<T extends string> = {
    tabs: DrawerTab<T>[]
    activeTab: T
    onChange: (tab: T) => void
    ariaLabel: string
}

export default function DrawerTabs<T extends string>({ tabs, activeTab, onChange, ariaLabel }: Props<T>) {
    const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const nextIndex = event.key === 'Home'
            ? 0
            : event.key === 'End'
                ? tabs.length - 1
                : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
        onChange(tabs[nextIndex].id)
        const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
        buttons?.[nextIndex]?.focus()
    }
    return <nav className="drawer-tabs" aria-label={ariaLabel} role="tablist">
        {tabs.map((tab, index) => <button
            key={tab.id}
            id={`drawer-tab-${tab.id}`}
            type="button"
            className={activeTab === tab.id ? 'active' : ''}
            aria-selected={activeTab === tab.id}
            aria-controls={`drawer-tab-panel-${tab.id}`}
            role="tab"
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => moveFocus(event, index)}
        >
            {tab.label}
            {tab.hasError && <span className="drawer-tab-error" aria-label="Contains an error">!</span>}
        </button>)}
    </nav>
}
