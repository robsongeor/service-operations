import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Mechanic } from '../types/mechanic.types'
import './SearchableMechanicSelect.css'

type Props = {
    mechanics: Mechanic[]
    selectedId: string
    isOpen: boolean
    isSaving: boolean
    onOpen: () => void
    onClose: () => void
    onSelect: (mechanicId: string) => void
    variant?: 'table' | 'drawer'
}

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

export default function SearchableMechanicSelect({ mechanics, selectedId, isOpen, isSaving, onOpen, onClose, onSelect, variant = 'table' }: Props) {
    const rootRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const onCloseRef = useRef(onClose)
    const [query, setQuery] = useState('')
    const [activeIndex, setActiveIndex] = useState(0)
    const [position, setPosition] = useState({ top: 0, left: 0, width: 220 })
    const selected = mechanics.find((mechanic) => mechanic.gr_mechanicid === selectedId)
    const results = useMemo(() => {
        const search = normalize(query)
        return mechanics
            .filter((mechanic) => mechanic.statecode !== 1 && (!search || normalize(`${mechanic.gr_name} ${mechanic.gr_email ?? ''} ${mechanic.gr_phone ?? ''}`).includes(search)))
            .sort((a, b) => a.gr_name.localeCompare(b.gr_name))
            .slice(0, 8)
    }, [mechanics, query])
    const optionCount = results.length + 1

    useEffect(() => {
        onCloseRef.current = onClose
    }, [onClose])

    useEffect(() => {
        if (!isOpen) return
        const updatePosition = () => {
            const rect = rootRef.current?.getBoundingClientRect()
            if (rect) setPosition({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 220) })
        }
        const closeOnOutsideClick = (event: MouseEvent) => {
            const target = event.target as Node
            if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) onCloseRef.current()
        }
        updatePosition()
        requestAnimationFrame(() => inputRef.current?.focus())
        document.addEventListener('mousedown', closeOnOutsideClick)
        window.addEventListener('resize', updatePosition)
        window.addEventListener('scroll', updatePosition, true)
        return () => {
            document.removeEventListener('mousedown', closeOnOutsideClick)
            window.removeEventListener('resize', updatePosition)
            window.removeEventListener('scroll', updatePosition, true)
        }
    }, [isOpen])

    const chooseActive = () => {
        if (activeIndex === 0) onSelect('')
        else if (results[activeIndex - 1]) onSelect(results[activeIndex - 1].gr_mechanicid)
    }

    return <div className={`jobs-mechanic-combobox ${variant}`} ref={rootRef}>
        <button type="button" className="jobs-mechanic-trigger" aria-label="Assigned mechanic" aria-haspopup="listbox" aria-expanded={isOpen} disabled={isSaving} onClick={() => { if (isOpen) onClose(); else { setQuery(''); setActiveIndex(0); onOpen() } }}>
            <span>{isSaving ? 'Saving…' : selected?.gr_name || 'Unassigned'}</span><span aria-hidden="true">⌄</span>
        </button>
        {isOpen && createPortal(<div className="jobs-mechanic-menu" ref={menuRef} style={{ top: position.top, left: position.left, width: position.width }}>
            <input ref={inputRef} type="search" role="combobox" aria-expanded="true" aria-controls="jobs-mechanic-results" placeholder="Search technicians…" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }} onKeyDown={(event) => {
                if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((current) => Math.min(current + 1, optionCount - 1)) }
                if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((current) => Math.max(current - 1, 0)) }
                if (event.key === 'Enter') { event.preventDefault(); chooseActive() }
                if (event.key === 'Escape') onClose()
            }} />
            <div id="jobs-mechanic-results" className="jobs-mechanic-results" role="listbox">
                <button type="button" role="option" aria-selected={activeIndex === 0} className={activeIndex === 0 ? 'active' : ''} onMouseEnter={() => setActiveIndex(0)} onClick={() => onSelect('')}><strong>Unassigned</strong><small>Clear technician</small></button>
                {results.map((mechanic, index) => <button key={mechanic.gr_mechanicid} type="button" role="option" aria-selected={activeIndex === index + 1} className={activeIndex === index + 1 ? 'active' : ''} onMouseEnter={() => setActiveIndex(index + 1)} onClick={() => onSelect(mechanic.gr_mechanicid)}><strong>{mechanic.gr_name}</strong>{(mechanic.gr_email || mechanic.gr_phone) && <small>{mechanic.gr_email || mechanic.gr_phone}</small>}</button>)}
                {results.length === 0 && <span>No technicians found</span>}
            </div>
        </div>, document.body)}
    </div>
}
