import { useEffect, useMemo, useRef, useState } from 'react'
import './SearchableSelect.css'

export type SearchableSelectOption = {
    value: string
    label: string
    secondary?: string
    searchText?: string
}

type Props = {
    id: string
    label: string
    value: string
    options: SearchableSelectOption[]
    onChange: (value: string) => void
    placeholder?: string
    searchPlaceholder?: string
    emptyLabel?: string
    disabled?: boolean
    required?: boolean
    error?: string
}

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

export default function SearchableSelect({
    id,
    label,
    value,
    options,
    onChange,
    placeholder = 'Select an option',
    searchPlaceholder = 'Search…',
    emptyLabel = 'No matching options',
    disabled = false,
    required = false,
    error = '',
}: Props) {
    const rootRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [activeIndex, setActiveIndex] = useState(0)
    const selected = options.find((option) => option.value === value)
    const results = useMemo(() => {
        const search = normalize(query)
        return options.filter((option) => !search || normalize(`${option.label} ${option.secondary ?? ''} ${option.searchText ?? ''}`).includes(search))
    }, [options, query])
    const optionCount = results.length + 1
    const listboxId = `${id}-results`
    const errorId = `${id}-error`

    useEffect(() => {
        if (!open) return
        const close = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', close)
        requestAnimationFrame(() => inputRef.current?.focus())
        return () => document.removeEventListener('mousedown', close)
    }, [open])

    const choose = (nextValue: string) => {
        onChange(nextValue)
        setOpen(false)
        setQuery('')
        setActiveIndex(0)
    }

    const chooseActive = () => {
        if (activeIndex === 0) choose('')
        else if (results[activeIndex - 1]) choose(results[activeIndex - 1].value)
    }

    return (
        <div className={error ? 'searchable-select error' : 'searchable-select'} ref={rootRef}>
            <label id={`${id}-label`}>{label}{required ? ' *' : ''}</label>
            <button
                id={id}
                type="button"
                className="searchable-select-trigger"
                aria-labelledby={`${id}-label ${id}`}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-describedby={error ? errorId : undefined}
                disabled={disabled}
                onClick={() => { setOpen((current) => !current); setQuery(''); setActiveIndex(0) }}
            >
                <span>{selected?.label ?? placeholder}</span><span aria-hidden="true">⌄</span>
            </button>
            {open && (
                <div className="searchable-select-menu">
                    <input
                        ref={inputRef}
                        type="search"
                        role="combobox"
                        aria-label={`Search ${label}`}
                        aria-expanded="true"
                        aria-controls={listboxId}
                        aria-activedescendant={`${listboxId}-${activeIndex}`}
                        autoComplete="off"
                        placeholder={searchPlaceholder}
                        value={query}
                        onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }}
                        onKeyDown={(event) => {
                            if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((current) => Math.min(current + 1, optionCount - 1)) }
                            if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((current) => Math.max(current - 1, 0)) }
                            if (event.key === 'Enter') { event.preventDefault(); chooseActive() }
                            if (event.key === 'Escape') setOpen(false)
                        }}
                    />
                    <div id={listboxId} className="searchable-select-results" role="listbox" aria-labelledby={`${id}-label`}>
                        <button id={`${listboxId}-0`} type="button" role="option" aria-selected={activeIndex === 0} className={activeIndex === 0 ? 'active' : ''} onMouseEnter={() => setActiveIndex(0)} onClick={() => choose('')}>
                            <strong>{placeholder}</strong><small>Clear selection</small>
                        </button>
                        {results.map((option, index) => (
                            <button id={`${listboxId}-${index + 1}`} key={option.value} type="button" role="option" aria-selected={activeIndex === index + 1} className={activeIndex === index + 1 ? 'active' : ''} onMouseEnter={() => setActiveIndex(index + 1)} onClick={() => choose(option.value)}>
                                <strong>{option.label}</strong>{option.secondary && <small>{option.secondary}</small>}
                            </button>
                        ))}
                        {results.length === 0 && <span>{emptyLabel}</span>}
                    </div>
                </div>
            )}
            {error && <small id={errorId} className="searchable-select-error" role="alert">{error}</small>}
        </div>
    )
}
