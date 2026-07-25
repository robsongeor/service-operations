import './FormSwitch.css'

type Props = {
    label: string
    checked: boolean
    disabled?: boolean
    onChange: (checked: boolean) => void
}

export default function FormSwitch({ label, checked, disabled = false, onChange }: Props) {
    const stateLabel = checked ? 'On' : 'Off'

    return <button
        type="button"
        className={checked ? 'form-switch checked' : 'form-switch'}
        role="switch"
        aria-checked={checked}
        aria-label={`${label}: ${stateLabel}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
    >
        <span className="form-switch-state">{stateLabel}</span>
        <span className="form-switch-track" aria-hidden="true"><span /></span>
    </button>
}
