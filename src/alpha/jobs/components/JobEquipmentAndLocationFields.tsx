import type { JobEquipmentFieldProps } from './JobEquipmentField'
import JobEquipmentField from './JobEquipmentField'

type Props = JobEquipmentFieldProps & {
    description?: string
}

export default function JobEquipmentAndLocationFields({
    description = 'Selecting Equipment fills its Customer, Site and address.',
    ...equipmentProps
}: Props) {
    return <>
        <div className="job-book-intake-section-heading">
            <h3>Equipment and location</h3>
            <p>{description}</p>
        </div>
        <JobEquipmentField {...equipmentProps} />
    </>
}
