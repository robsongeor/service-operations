import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
    const [position, setPosition] = useState({ top: 0, left: 0, width: 220, maxHeight: 320 })
    const selected = mechanics.find((mechanic) => mechanic.gr_mechanicid === selectedId)
    const results = useMemo(() => {
        const search = normalize(query)
        return mechanics
            .filter((mechanic) => mechanic.statecode !== 1 && (!search || normalize(`${mechanic.gr_name} ${mechanic.gr_email ?? ''} ${mechanic.gr_phone ?? ''}`).includes(search)))
            .sort((a, b) => a.gr_name.localeCompare(b.gr_name))
            .slice(0, 8)
    }, [mechanics, query])
    const optionCount = results.length + 1

    const updatePosition = useCallback(() => {
        const rect = rootRef.current?.getBoundingClientRect()
        if (!rect) return
        const margin = 8
        const gap = 4
        const width = Math.min(Math.max(rect.width, 220), window.innerWidth - margin * 2)
        const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin)
        const desiredHeight = Math.min(menuRef.current?.scrollHeight || 320, 320)
        const availableBelow = window.innerHeight - rect.bottom - gap - margin
        const availableAbove = rect.top - gap - margin
        const opensUpward = availableBelow < desiredHeight && availableAbove > availableBelow
        const maxHeight = Math.max(120, Math.min(desiredHeight, opensUpward ? availableAbove : availableBelow))
        const top = opensUpward
            ? Math.max(margin, rect.top - gap - maxHeight)
            : Math.max(margin, rect.bottom + gap)
        setPosition({ top, left, width, maxHeight })
    }, [])

    useEffect(() => {
        onCloseRef.current = onClose
    }, [onClose])

    useEffect(() => {
        if (!isOpen) return
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
    }, [isOpen, updatePosition])

    useLayoutEffect(() => {
        if (!isOpen) return
        const frame = requestAnimationFrame(updatePosition)
        return () => cancelAnimationFrame(frame)
    }, [isOpen, results.length, updatePosition])

    const chooseActive = () => {
        if (activeIndex === 0) onSelect('')
        else if (results[activeIndex - 1]) onSelect(results[activeIndex - 1].gr_mechanicid)
    }

    return <div className={`jobs-mechanic-combobox ${variant}`} ref={rootRef}>
        <button type="button" className="jobs-mechanic-trigger" aria-label="Assigned mechanic" aria-haspopup="listbox" aria-expanded={isOpen} disabled={isSaving} onClick={() => { if (isOpen) onClose(); else { setQuery(''); setActiveIndex(0); onOpen() } }}>
            <span>{isSaving ? 'Saving…' : selected?.gr_name || 'Unassigned'}</span><span aria-hidden="true">⌄</span>
        </button>
        {isOpen && createPortal(<div className="jobs-mechanic-menu" ref={menuRef} style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}>
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
