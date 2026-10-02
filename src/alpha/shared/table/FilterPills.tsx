import './OperationsTable.css'

type Props<Value extends string> = {
    label: string
    value: Value
    options: readonly { value: Value; label: string; count?: number }[]
    onChange: (value: Value) => void
}

export default function FilterPills<Value extends string>({ label, value, options, onChange }: Props<Value>) {
    return <div className="operations-filter-pills" role="group" aria-label={label}>
        {options.map((option) => <button key={option.value} type="button" className={value === option.value ? 'active' : ''} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
            {option.label}{option.count !== undefined && <span>{option.count}</span>}
        </button>)}
    </div>
}
