import type { Equipment } from '../../jobs/types/equipment.types'
import type { EquipmentSortKey, SortDirection } from '../types/equipmentManager.types'
import type { EquipmentServicePlan } from '../servicePlans/equipmentServicePlan.types'
import { SERVICE_TYPE_OPTIONS } from '../servicePlans/equipmentServicePlan.types'
import { calculateHoursRemaining, calculatePrimaryNextService } from '../servicePlans/servicePlanStatus'
import EquipmentDataQualityIndicator from './EquipmentDataQualityIndicator'
import { parseAlternateFleetNumbers } from '../identifiers/alternateFleetNumbers'

type Props = {
    equipment: Equipment[]
    servicePlans: EquipmentServicePlan[]
    servicePlansLoading?: boolean
    servicePlansUnavailable?: boolean
    sortKey: EquipmentSortKey
    sortDirection: SortDirection
    onSort: (key: EquipmentSortKey) => void
    onEdit: (equipment: Equipment) => void
}

const columns: { key: EquipmentSortKey; label: string }[] = [
    { key: 'fleet', label: 'Fleet number' },
    { key: 'customer', label: 'Customer' },
    { key: 'site', label: 'Site' },
    { key: 'make', label: 'Make' },
    { key: 'model', label: 'Model' },
    { key: 'serial', label: 'Serial number' },
]

function valueOrDash(value?: string | null) {
    return value?.trim() || '—'
}

export default function EquipmentTable({ equipment, servicePlans, servicePlansLoading = false, servicePlansUnavailable = false, sortKey, sortDirection, onSort, onEdit }: Props) {
    return (
        <div className="equipment-table-scroll">
            <table className="equipment-table">
                <thead>
                    <tr>
                        {columns.map((column) => (
                            <th key={column.key} aria-sort={sortKey === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                <button type="button" onClick={() => onSort(column.key)}>
                                    {column.label}
                                    <span aria-hidden="true">{sortKey === column.key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}</span>
                                </button>
                            </th>
                        ))}
                        <th>State</th>
                        <th>Next service</th>
                        <th className="equipment-data-quality-heading" aria-sort={sortKey === 'dataStatus' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                            <button type="button" onClick={() => onSort('dataStatus')} aria-label="Sort by Data status">
                                <span className="equipment-visually-hidden">Data status</span>
                                <span aria-hidden="true">{sortKey === 'dataStatus' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                            </button>
                        </th>
                        <th><span className="equipment-visually-hidden">Actions</span></th>
                    </tr>
                </thead>
                <tbody>
                    {equipment.length === 0 ? (
                        <tr><td className="equipment-empty" colSpan={10}>No equipment matches the current search and filters.</td></tr>
                    ) : equipment.map((item) => {
                        const itemServicePlans = servicePlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === item.gr_equipmentid.toLowerCase())
                        const primary = calculatePrimaryNextService(itemServicePlans, item)
                        const remaining = primary ? calculateHoursRemaining(item.gr_currenthourmeter ?? 0, primary.gr_nextduehours) : null
                        const label = primary ? SERVICE_TYPE_OPTIONS.find((option) => option.value === primary.gr_servicetype)?.label.replace(' Service', '') : null
                        return (
                        <tr
                            key={item.gr_equipmentid}
                            tabIndex={0}
                            onClick={() => onEdit(item)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    onEdit(item)
                                }
                            }}
                        >
                            <td><span className="equipment-fleet-identity"><strong>{valueOrDash(item.gr_fleet)}</strong>{parseAlternateFleetNumbers(item.gr_alternatefleetnumbers).length > 0 && <small>Also {parseAlternateFleetNumbers(item.gr_alternatefleetnumbers).join(' · ')}</small>}</span></td>
                            <td>{valueOrDash(item.gr_Site?.gr_Customer?.gr_name)}</td>
                            <td>{valueOrDash(item.gr_Site?.gr_name)}</td>
                            <td>{valueOrDash(item.gr_make)}</td>
                            <td>{valueOrDash(item.gr_model)}</td>
                            <td>{valueOrDash(item.gr_serial)}</td>
                            <td><span className={item.statecode === 0 ? 'equipment-state active' : 'equipment-state'}>{item.statecode === 0 ? 'Active' : 'Inactive'}</span></td>
                            <td>{servicePlansLoading ? <span className="equipment-maintenance-summary"><small>Loading…</small></span> : servicePlansUnavailable ? <span title="Maintenance summaries could not be loaded.">Unavailable</span> : primary ? <span className="equipment-maintenance-summary"><strong>{label} @ {primary.gr_nextduehours}</strong><small>{remaining != null ? `${Math.abs(remaining)} hrs ${remaining < 0 ? 'overdue' : 'remaining'}` : 'Due hours unavailable'}</small></span> : 'Not Configured'}</td>
                            <td className="equipment-data-quality-cell">{servicePlansLoading ? <span className="equipment-data-quality-loading" role="status">Loading…</span> : servicePlansUnavailable ? <span title="Maintenance data quality could not be calculated.">Unavailable</span> : <EquipmentDataQualityIndicator equipment={item} servicePlans={itemServicePlans} />}</td>
                            <td>
                                <button
                                    className="equipment-edit-action"
                                    type="button"
                                    onClick={(event) => { event.stopPropagation(); onEdit(item) }}
                                >Edit</button>
                            </td>
                        </tr>)
                    })}
                </tbody>
            </table>
        </div>
    )
}
