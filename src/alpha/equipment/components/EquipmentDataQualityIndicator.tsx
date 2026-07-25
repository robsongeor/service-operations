import type { Equipment } from '../../jobs/types/equipment.types'
import { evaluateEquipmentDataQuality } from '../dataQuality/equipmentDataQuality'
import type { EquipmentServicePlan } from '../servicePlans/equipmentServicePlan.types'
import './EquipmentDataQualityIndicator.css'

type Props = {
    equipment: Equipment
    servicePlans: EquipmentServicePlan[]
}

export default function EquipmentDataQualityIndicator({ equipment, servicePlans }: Props) {
    const quality = evaluateEquipmentDataQuality(equipment, servicePlans)
    if (quality.severity === 'none') return null

    const label = quality.severity === 'critical' ? 'Critical' : 'Warning'
    const title = [...quality.criticalIssues, ...quality.warningIssues].join('\n')

    return <details
        className={`equipment-data-quality ${quality.severity}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
    >
        <summary title={title} aria-label={`${label} Equipment data quality. Activate for details.`}>
            <span aria-hidden="true">!</span>
        </summary>
        <div className="equipment-data-quality-popover">
            {quality.criticalIssues.length > 0 && <section>
                <strong>Critical</strong>
                <ul>{quality.criticalIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
            </section>}
            {quality.warningIssues.length > 0 && <section>
                <strong>Warning</strong>
                <ul>{quality.warningIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
            </section>}
        </div>
    </details>
}
