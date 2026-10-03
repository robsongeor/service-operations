import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Mechanic } from '../types/mechanic.types'
import { mechanicSelectOptions, type MechanicSelectOption } from '../utils/mechanicSelectOptions'
import { announceExclusiveDropdownOpen, closeWhenAnotherDropdownOpens } from '../../shared/dropdown/exclusiveDropdown'
import './SearchableMechanicSelect.css'

type Props = {
    mechanics: Mechanic[]
    selectedId: string
    selectedName?: string
    isOpen: boolean
    isSaving: boolean
    onOpen: () => void
    onClose: () => void
    onSelect: (mechanicId: string) => void
    onSelectCustom?: (name: string) => void
    variant?: 'table' | 'drawer'
}

export default function SearchableMechanicSelect({ mechanics, selectedId, selectedName, isOpen, isSaving, onOpen, onClose, onSelect, onSelectCustom, variant = 'table' }: Props) {
    const resultsId = useId()
    const rootRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const onCloseRef = useRef(onClose)
    const [query, setQuery] = useState('')
    const [activeIndex, setActiveIndex] = useState(0)
    const [position, setPosition] = useState({ top: 0, left: 0, width: 220, maxHeight: 320 })
    const selected = mechanics.find((mechanic) => mechanic.gr_mechanicid === selectedId)
    const allowCustom = Boolean(onSelectCustom)
    const options = useMemo(() => mechanicSelectOptions(mechanics, query, allowCustom), [mechanics, query, allowCustom])
    const activeOptionIndex = Math.min(activeIndex, options.length - 1)

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
        return closeWhenAnotherDropdownOpens(resultsId, () => onCloseRef.current())
    }, [isOpen, resultsId])

    useEffect(() => {
        if (!isOpen) return
        announceExclusiveDropdownOpen(resultsId)
        const closeOnOutsideClick = (event: MouseEvent | FocusEvent) => {
            const target = event.target as Node
            if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) onCloseRef.current()
        }
        updatePosition()
        const frame = requestAnimationFrame(() => inputRef.current?.focus())
        document.addEventListener('mousedown', closeOnOutsideClick, true)
        document.addEventListener('focusin', closeOnOutsideClick, true)
        window.addEventListener('resize', updatePosition)
        window.addEventListener('scroll', updatePosition, true)
        return () => {
            cancelAnimationFrame(frame)
            document.removeEventListener('mousedown', closeOnOutsideClick, true)
            document.removeEventListener('focusin', closeOnOutsideClick, true)
            window.removeEventListener('resize', updatePosition)
            window.removeEventListener('scroll', updatePosition, true)
        }
    }, [isOpen, resultsId, updatePosition])

    useLayoutEffect(() => {
        if (!isOpen) return
        const frame = requestAnimationFrame(updatePosition)
        return () => cancelAnimationFrame(frame)
    }, [isOpen, options.length, updatePosition])

    const choose = (option: MechanicSelectOption) => {
        rootRef.current?.querySelector('button')?.focus()
        if (option.kind === 'custom') onSelectCustom?.(option.name)
        else onSelect(option.id)
        onClose()
    }

    return <div className={`jobs-mechanic-combobox ${variant}`} ref={rootRef} onKeyDown={(event) => {
        if (!isOpen) return
        if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onClose()
            rootRef.current?.querySelector('button')?.focus()
        }
        if (event.key === 'Tab') {
            onClose()
            rootRef.current?.querySelector('button')?.focus()
        }
    }}>
        <button type="button" className="jobs-mechanic-trigger" aria-label="Assigned mechanic" aria-haspopup="listbox" aria-expanded={isOpen} disabled={isSaving} onClick={() => { if (isOpen) onClose(); else { setQuery(''); setActiveIndex(0); onOpen() } }}>
            <span>{isSaving ? 'Saving…' : selected?.gr_name || selectedName || 'Unassigned'}</span><span aria-hidden="true">⌄</span>
        </button>
        {isOpen && createPortal(<div className="jobs-mechanic-menu" ref={menuRef} style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}>
            <input ref={inputRef} type="search" role="combobox" aria-label="Search technicians" aria-expanded="true" aria-controls={resultsId} aria-activedescendant={`${resultsId}-${activeOptionIndex}`} placeholder="Search technicians…" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }} onKeyDown={(event) => {
                if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(Math.min(activeOptionIndex + 1, options.length - 1)) }
                if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(Math.max(activeOptionIndex - 1, 0)) }
                if (event.key === 'Enter') { event.preventDefault(); choose(options[activeOptionIndex]) }
            }} />
            <div id={resultsId} className="jobs-mechanic-results" role="listbox" aria-label="Technicians">
                {options.map((option, index) => <button key={`${option.kind}-${option.id}`} id={`${resultsId}-${index}`} type="button" role="option" aria-selected={activeOptionIndex === index} className={activeOptionIndex === index ? 'active' : ''} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}><strong>{option.kind === 'custom' ? `Use “${option.name}”` : option.name}</strong>{option.secondary && <small>{option.secondary}</small>}</button>)}
                {!options.some((option) => option.kind === 'mechanic') && <span>No technicians found</span>}
            </div>
        </div>, document.body)}
    </div>
}
