import { useMemo, useState } from 'react'
import { getJobTypeLabel } from '../jobs/types/jobType.types'
import { JOB_STATUSES, JOB_STATUS_OPTIONS } from '../jobs/types/jobStatus.types'
import type { Mechanic } from '../jobs/types/mechanic.types'
import MechanicDialog from './components/MechanicDialog'
import { useMechanics } from './hooks/useMechanics'
import type { MechanicInput } from './services/mechanicsApi'
import './MechanicsScreen.css'
import { getQualificationStatus } from '../wof/utils/wofRules'

const createdDate = new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })

function initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'M'
}

export default function MechanicsScreen() {
    const {
        mechanics,
        jobs,
        qualifications,
        qualificationTypes,
        isLoading,
        isSaving,
        loadError,
        saveError,
        reload,
        clearSaveError,
        createMechanic,
        updateMechanic,
        setMechanicActive,
        createQualification,
        updateQualification,
        deactivateQualification,
    } = useMechanics()
    const [selectedId, setSelectedId] = useState('')
    const [search, setSearch] = useState('')
    const [showInactive, setShowInactive] = useState(false)
    const [jobView, setJobView] = useState<'open' | 'complete' | 'all'>('open')
    const [editingMechanic, setEditingMechanic] = useState<Mechanic | null | undefined>(undefined)
    const [actionError, setActionError] = useState('')

    const visibleMechanics = useMemo(() => {
        const query = search.trim().toLowerCase()
        return mechanics.filter((mechanic) => {
            if (!showInactive && mechanic.statecode !== 0) return false
            return !query || [mechanic.gr_name, mechanic.gr_phone, mechanic.gr_email, mechanic.gr_camnumber, mechanic.gr_rego, mechanic.gr_region]
                .some((value) => value?.toLowerCase().includes(query))
        })
    }, [mechanics, search, showInactive])

    const selectedMechanic = mechanics.find((mechanic) => mechanic.gr_mechanicid === selectedId)
        ?? visibleMechanics[0]

    const selectedJobs = useMemo(() => {
        if (!selectedMechanic) return []
        return jobs.filter((job) => {
            if (job.gr_Mechanic?.gr_mechanicid !== selectedMechanic.gr_mechanicid) return false
            if (jobView === 'open') return job.gr_status !== JOB_STATUSES.COMPLETE
            if (jobView === 'complete') return job.gr_status === JOB_STATUSES.COMPLETE
            return true
        })
    }, [jobView, jobs, selectedMechanic])

    const openJobCount = (mechanicId: string) => jobs.filter(
        (job) => job.gr_Mechanic?.gr_mechanicid === mechanicId && job.gr_status !== JOB_STATUSES.COMPLETE,
    ).length

    const qualificationsFor = (mechanicId: string) => qualifications.filter((qualification) => qualification.gr_Technician?.gr_mechanicid === mechanicId)
    const validQualificationsFor = (mechanicId: string) => qualificationsFor(mechanicId).filter((qualification) => getQualificationStatus(qualification) === 'valid')

    const saveMechanic = async (input: MechanicInput) => {
        try {
            if (editingMechanic) {
                await updateMechanic(editingMechanic.gr_mechanicid, input)
            } else {
                const created = await createMechanic(input)
                setEditingMechanic(created)
                setSelectedId(created.gr_mechanicid)
                return
            }
            setEditingMechanic(undefined)
        } catch {
            // The hook exposes the Dataverse message in the dialog.
        }
    }

    const toggleActive = async () => {
        if (!selectedMechanic) return
        setActionError('')
        try {
            await setMechanicActive(selectedMechanic.gr_mechanicid, selectedMechanic.statecode !== 0)
        } catch (error) {
            setActionError(error instanceof Error ? error.message : 'The mechanic status could not be changed.')
        }
    }

    return (
        <div className="mechanics-page">
            <header className="mechanics-page-header">
                <div><span>People</span><h1>Mechanics</h1></div>
                <button className="mechanic-primary-button" type="button" onClick={() => { clearSaveError(); setEditingMechanic(null) }}>
                    + Add mechanic
                </button>
            </header>

            {isLoading ? (
                <section className="mechanics-data-state"><h2>Loading mechanics</h2><p>Connecting to Dataverse and finding allocated jobs.</p></section>
            ) : loadError ? (
                <section className="mechanics-data-state mechanics-data-error" role="alert">
                    <div><h2>Mechanics could not be loaded</h2><p>{loadError}</p></div>
                    <button type="button" onClick={() => void reload()}>Try again</button>
                </section>
            ) : (
                <div className="mechanics-workspace">
                    <aside className="mechanics-directory">
                        <div className="mechanics-directory-tools">
                            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search mechanics" aria-label="Search mechanics" />
                            <label><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Show inactive</label>
                        </div>
                        <div className="mechanics-list">
                            {visibleMechanics.map((mechanic) => {
                                const count = openJobCount(mechanic.gr_mechanicid)
                                const selected = mechanic.gr_mechanicid === selectedMechanic?.gr_mechanicid
                                return (
                                    <button
                                        type="button"
                                        className={selected ? 'mechanic-card selected' : 'mechanic-card'}
                                        key={mechanic.gr_mechanicid}
                                        onClick={() => setSelectedId(mechanic.gr_mechanicid)}
                                    >
                                        <span className="mechanic-avatar">{initials(mechanic.gr_name)}</span>
                                        <span className="mechanic-card-copy">
                                            <strong>{mechanic.gr_name}</strong>
                                            <small>{mechanic.statecode === 0 ? `${count} open ${count === 1 ? 'job' : 'jobs'}` : 'Inactive'}</small>
                                            {validQualificationsFor(mechanic.gr_mechanicid).length > 0 && <span className="mechanic-qualification-summary">{validQualificationsFor(mechanic.gr_mechanicid)[0].gr_QualificationType?.gr_name}{validQualificationsFor(mechanic.gr_mechanicid).length > 1 ? ` +${validQualificationsFor(mechanic.gr_mechanicid).length - 1}` : ''}</span>}
                                        </span>
                                        <span aria-hidden="true">›</span>
                                    </button>
                                )
                            })}
                            {visibleMechanics.length === 0 && <p className="mechanics-list-empty">No mechanics match these filters.</p>}
                        </div>
                    </aside>

                    <main className="mechanic-detail">
                        {selectedMechanic ? (
                            <>
                                <header className="mechanic-detail-header">
                                    <div className="mechanic-detail-person">
                                        <span className="mechanic-avatar large">{initials(selectedMechanic.gr_name)}</span>
                                        <div>
                                            <div className="mechanic-name-line">
                                                <h2>{selectedMechanic.gr_name}</h2>
                                                <span className={selectedMechanic.statecode === 0 ? 'mechanic-state active' : 'mechanic-state'}>
                                                    {selectedMechanic.statecode === 0 ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                            <p>{selectedMechanic.gr_phone || 'No phone'} · {selectedMechanic.gr_email || 'No email'}</p>
                                        </div>
                                    </div>
                                    <div className="mechanic-detail-actions">
                                        <button type="button" onClick={() => { clearSaveError(); setEditingMechanic(selectedMechanic) }}>Edit</button>
                                        <button type="button" onClick={() => void toggleActive()} disabled={isSaving}>
                                            {selectedMechanic.statecode === 0 ? 'Deactivate' : 'Activate'}
                                        </button>
                                    </div>
                                </header>

                                {actionError && <p className="mechanic-action-error" role="alert">{actionError}</p>}

                                <section className="mechanic-jobs-section">
                                    <div className="mechanic-jobs-heading">
                                        <div><span>Work allocation</span><h3>Allocated jobs</h3></div>
                                        <div className="mechanic-job-tabs">
                                            {(['open', 'complete', 'all'] as const).map((view) => (
                                                <button key={view} type="button" className={jobView === view ? 'active' : ''} onClick={() => setJobView(view)}>
                                                    {view === 'open' ? 'Open' : view === 'complete' ? 'Completed' : 'All'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="mechanic-jobs-table-shell">
                                        <table className="mechanic-jobs-table">
                                            <thead><tr><th>Job</th><th>Status</th><th>Type</th><th>Customer / site</th><th>Equipment</th><th>Description</th><th>Created</th></tr></thead>
                                            <tbody>
                                                {selectedJobs.map((job) => (
                                                    <tr key={job.gr_jobid}>
                                                        <td><strong>{job.gr_jobnumber || 'Unnumbered'}</strong><small>{job.gr_ordernumber ? `Order ${job.gr_ordernumber}` : 'No order number'}</small></td>
                                                        <td><span className={`mechanic-job-status status-${job.gr_status}`}>{JOB_STATUS_OPTIONS.find((status) => status.value === job.gr_status)?.label ?? 'Unknown'}</span></td>
                                                        <td>{getJobTypeLabel(job.gr_jobtype)}</td>
                                                        <td><strong>{job.gr_Site?.gr_Customer?.gr_name || 'No customer'}</strong><small>{job.gr_Site?.gr_name || 'No site'}</small></td>
                                                        <td><strong>{job.gr_Equipment?.gr_fleet || 'No equipment'}</strong><small>{[job.gr_Equipment?.gr_make, job.gr_Equipment?.gr_model].filter(Boolean).join(' ')}</small></td>
                                                        <td className="mechanic-job-description">{job.gr_description || 'No description'}</td>
                                                        <td>{createdDate.format(new Date(job.createdon))}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {selectedJobs.length === 0 && <div className="mechanic-jobs-empty"><strong>No {jobView === 'all' ? '' : jobView} jobs</strong><span>Jobs assigned to this mechanic will appear here.</span></div>}
                                    </div>
                                </section>
                            </>
                        ) : (
                            <div className="mechanic-detail-empty"><h2>Select a mechanic</h2><p>Their allocated jobs will appear here.</p></div>
                        )}
                    </main>
                </div>
            )}

            {editingMechanic !== undefined && (
                <MechanicDialog
                    mechanic={editingMechanic}
                    isSaving={isSaving}
                    error={saveError}
                    onClose={() => setEditingMechanic(undefined)}
                    onSave={saveMechanic}
                    qualifications={editingMechanic ? qualificationsFor(editingMechanic.gr_mechanicid) : []}
                    qualificationTypes={qualificationTypes}
                    onCreateQualification={createQualification}
                    onUpdateQualification={updateQualification}
                    onDeactivateQualification={deactivateQualification}
                />
            )}
        </div>
    )
}
