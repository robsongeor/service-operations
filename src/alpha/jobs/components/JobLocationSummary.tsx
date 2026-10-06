import './JobEquipmentLocation.css'

type Props = {
    customer?: string
    site?: string
    address?: string
    onEdit?: () => void
    disabled?: boolean
}

// Shared presentation for current Equipment location and a saved entry's location snapshot.
// The caller owns which record is displayed and what an explicit edit is allowed to change.
export default function JobLocationSummary({ customer, site, address, onEdit, disabled }: Props) {
    return <div className="job-equipment-location-tile">
        <div><span className="job-equipment-location-caption">Customer &amp; site</span>
            <strong>{customer || 'No customer linked'}</strong>
            <span>{site || 'No site linked'}</span>
            {address && <small>{address}</small>}
        </div>
        {onEdit && <button type="button" aria-label="Edit location" disabled={disabled} onClick={onEdit}>Edit</button>}
    </div>
}
