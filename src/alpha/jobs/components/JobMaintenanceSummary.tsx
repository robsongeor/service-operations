import type { Equipment } from '../types/equipment.types'
import type { EquipmentServicePlan } from '../../equipment/servicePlans/equipmentServicePlan.types'
import { SERVICE_TYPE_OPTIONS } from '../../equipment/servicePlans/equipmentServicePlan.types'
import { calculateHoursRemaining } from '../../equipment/servicePlans/servicePlanStatus'
import { formatMaintenanceInterval, resolveMaintenanceConfiguration } from '../../equipment/servicePlans/maintenanceConfiguration'

type Props = {
    equipment?: Equipment
    servicePlans: EquipmentServicePlan[]
    loadStatus?: 'idle' | 'loading' | 'ready' | 'error'
    loadError?: string
    onRetry?: () => void
}

export default function JobMaintenanceSummary({ equipment, servicePlans, loadStatus = 'ready', loadError = '', onRetry }: Props) {
    const currentHours = equipment?.gr_currenthourmeter ?? 0
    const configuration = resolveMaintenanceConfiguration(equipment)

    return <section className="job-maintenance-summary job-edit-field-wide" aria-label="Current Maintenance Schedule">
        <div className="job-maintenance-summary-heading">
            <h3>Current Maintenance Schedule</h3>
            <span>Last Known Hour Meter: {equipment?.gr_currenthourmeter ?? '-'}</span>
        </div>
        {loadStatus === 'loading' ? <p role="status">Loading this Equipment's maintenance schedule…</p>
            : loadStatus === 'error' ? <p role="alert">The maintenance schedule is temporarily unavailable. {loadError} {onRetry && <button type="button" onClick={onRetry}>Try again</button>}</p>
                : !equipment ? <p>Select equipment to view its maintenance plan.</p> : servicePlans.length === 0 ? <p>No maintenance schedule has been created for this equipment.</p> : <div className="job-maintenance-summary-plans">
            {configuration.activeServiceTypes.map((serviceType) => {
                const plan = servicePlans.find((item) => item.gr_servicetype === serviceType)
                const remaining = plan ? calculateHoursRemaining(currentHours, plan.gr_nextduehours) : null
                const isOverdue = remaining != null && remaining < 0

                return <article className={isOverdue ? 'overdue' : ''} key={serviceType}>
                    <strong>{SERVICE_TYPE_OPTIONS.find((option) => option.value === serviceType)?.label}</strong>
                    <span>Due: {plan?.gr_nextduehours ?? '-'}</span>
                    <span>{configuration.serviceLevels[serviceType]?.hours} hours or {formatMaintenanceInterval(configuration.serviceLevels[serviceType]!.timeInterval)}</span>
                    <span className={isOverdue ? 'job-maintenance-overdue' : ''}>Remaining: {remaining == null ? '-' : isOverdue ? `${Math.abs(remaining)} overdue` : remaining}</span>
                </article>
            })}
        </div>}
    </section>
}
