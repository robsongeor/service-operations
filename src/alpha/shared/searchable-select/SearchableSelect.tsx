import { useEffect, useMemo, useRef, useState } from 'react'
import { announceExclusiveDropdownOpen, closeWhenAnotherDropdownOpens } from '../dropdown/exclusiveDropdown'
import './SearchableSelect.css'

export type SearchableSelectOption = {
    value: string
    label: string
    secondary?: string
    searchText?: string
    emphasized?: boolean
}

export type SearchableSelectAction = {
    label: string
    secondary?: string
    onSelect: () => void
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
    autoFocus?: boolean
    required?: boolean
    error?: string
    multiple?: boolean
    values?: string[]
    onValuesChange?: (values: string[]) => void
    resultLimit?: number
    onSearchChange?: (query: string) => void
    onOpenChange?: (open: boolean) => void
    isSearching?: boolean
    searchError?: string
    onRetrySearch?: () => void
    menuAction?: SearchableSelectAction
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
    autoFocus = false,
    required = false,
    error = '',
    multiple = false,
    values = [],
    onValuesChange,
    resultLimit,
    onSearchChange,
    onOpenChange,
    isSearching = false,
    searchError = '',
    onRetrySearch,
    menuAction,
}: Props) {
    const rootRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const onOpenChangeRef = useRef(onOpenChange)
    const [open, setOpen] = useState(autoFocus && !disabled)
    const [query, setQuery] = useState('')
    const [activeIndex, setActiveIndex] = useState(0)
    const selected = options.find((option) => option.value === value)
    const selectedValueSet = useMemo(() => new Set(values), [values])
    const results = useMemo(() => {
        const search = normalize(query)
        const matching = options
            .filter((option) => !multiple || !selectedValueSet.has(option.value))
            .filter((option) => !search || normalize(`${option.label} ${option.secondary ?? ''} ${option.searchText ?? ''}`).includes(search))
        return typeof resultLimit === 'number' ? matching.slice(0, resultLimit) : matching
    }, [multiple, options, query, resultLimit, selectedValueSet])
    const clearOptionCount = multiple ? 0 : 1
    const actionOptionCount = menuAction ? 1 : 0
    const resultOffset = clearOptionCount + actionOptionCount
    const optionCount = results.length + resultOffset
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

    useEffect(() => { onOpenChangeRef.current = onOpenChange }, [onOpenChange])

    useEffect(() => onOpenChangeRef.current?.(open), [open])

    useEffect(() => closeWhenAnotherDropdownOpens(listboxId, () => setOpen(false)), [listboxId])

    const choose = (nextValue: string) => {
        if (multiple) {
            if (nextValue && !selectedValueSet.has(nextValue)) onValuesChange?.([...values, nextValue])
            setQuery('')
            setActiveIndex(0)
            return
        }
        onChange(nextValue)
        setOpen(false)
        setQuery('')
        setActiveIndex(0)
    }

    const chooseActive = () => {
        if (!multiple && activeIndex === 0) choose('')
        else if (menuAction && activeIndex === clearOptionCount) {
            menuAction.onSelect()
            setOpen(false)
            setQuery('')
            setActiveIndex(0)
        } else if (results[activeIndex - resultOffset]) choose(results[activeIndex - resultOffset].value)
    }

    return (
        <div
            className={error ? 'searchable-select error' : 'searchable-select'}
            ref={rootRef}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
            }}
            onKeyDownCapture={(event) => {
                if (open && event.key === 'Tab') setOpen(false)
            }}
        >
            <label id={`${id}-label`}>{label}{required ? ' *' : ''}</label>
            {open ? <input
                id={id}
                ref={inputRef}
                className="searchable-select-input"
                type="search"
                role="combobox"
                aria-labelledby={`${id}-label`}
                aria-expanded="true"
                aria-controls={listboxId}
                aria-activedescendant={`${listboxId}-${activeIndex}`}
                aria-describedby={error ? errorId : undefined}
                autoComplete="off"
                placeholder={searchPlaceholder}
                value={query}
                onChange={(event) => {
                    setQuery(event.target.value)
                    onSearchChange?.(event.target.value)
                    setActiveIndex(0)
                }}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((current) => Math.min(current + 1, Math.max(optionCount - 1, 0))) }
                    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((current) => Math.max(current - 1, 0)) }
                    if (event.key === 'Enter') { event.preventDefault(); chooseActive() }
                    if (event.key === 'Escape') { setOpen(false); setQuery('') }
                }}
            /> : <button
                id={id}
                type="button"
                className="searchable-select-trigger"
                aria-labelledby={`${id}-label ${id}`}
                aria-haspopup="listbox"
                aria-expanded="false"
                aria-describedby={error ? errorId : undefined}
                title={!multiple ? selected?.label : undefined}
                disabled={disabled}
                onClick={() => {
                    announceExclusiveDropdownOpen(listboxId)
                    setOpen(true)
                    setQuery('')
                    onSearchChange?.('')
                    setActiveIndex(0)
                }}
            >
                <span>{multiple && values.length > 0 ? `${values.length} selected` : selected?.label ?? placeholder}</span><span aria-hidden="true">⌄</span>
            </button>}
            {open && (
                <div className="searchable-select-menu">
                    <div id={listboxId} className="searchable-select-results" role="listbox" aria-multiselectable={multiple || undefined} aria-labelledby={`${id}-label`}>
                        {!multiple && <button id={`${listboxId}-0`} type="button" role="option" aria-selected={activeIndex === 0} className={activeIndex === 0 ? 'active' : ''} onMouseEnter={() => setActiveIndex(0)} onClick={() => choose('')}>
                            <strong>{placeholder}</strong><small>Clear selection</small>
                        </button>}
                        {menuAction && <button id={`${listboxId}-${clearOptionCount}`} type="button" role="option" aria-selected={activeIndex === clearOptionCount} className={activeIndex === clearOptionCount ? 'active searchable-select-menu-action' : 'searchable-select-menu-action'} onMouseEnter={() => setActiveIndex(clearOptionCount)} onClick={() => { menuAction.onSelect(); setOpen(false); setQuery(''); setActiveIndex(0) }}>
                            <strong>{menuAction.label}</strong>{menuAction.secondary && <small>{menuAction.secondary}</small>}
                        </button>}
                        {results.map((option, index) => (
                            <button id={`${listboxId}-${index + resultOffset}`} key={option.value} type="button" role="option" aria-selected={activeIndex === index + resultOffset} className={[activeIndex === index + resultOffset ? 'active' : '', option.emphasized ? 'emphasized' : ''].filter(Boolean).join(' ')} onMouseEnter={() => setActiveIndex(index + resultOffset)} onClick={() => choose(option.value)}>
                                <strong>{option.label}</strong>{option.secondary && <small>{option.secondary}</small>}
                            </button>
                        ))}
                        {isSearching && <span>Searching…</span>}
                        {!isSearching && searchError && <span role="alert">{searchError}</span>}
                        {!isSearching && searchError && onRetrySearch && <button type="button" onClick={onRetrySearch}>Retry search</button>}
                        {!isSearching && !searchError && results.length === 0 && <span>{emptyLabel}</span>}
                    </div>
                </div>
            )}
            {error && <small id={errorId} className="searchable-select-error" role="alert">{error}</small>}
        </div>
    )
}
