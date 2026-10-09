import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Equipment } from '../jobs/types/equipment.types'
import { equipmentIdentifierSearchValues } from '../equipment/identifiers/alternateFleetNumbers'
import type { Site, SiteInductionDocument } from '../jobs/types/site.types'
import DrawerTabs from '../shared/drawer/DrawerTabs'
import EditDrawerConfirmation from '../shared/drawer/EditDrawerConfirmation'
import EditDrawerSection from '../shared/drawer/EditDrawerSection'
import EditDrawerShell from '../shared/drawer/EditDrawerShell'
import SearchableSelect from '../shared/searchable-select/SearchableSelect'
import FormSwitch from '../shared/form-switch/FormSwitch'
import {
    resolveSiteCheckEquipmentScope,
    SITE_CHECK_EQUIPMENT_SCOPE_OPTIONS,
    SITE_CHECK_EQUIPMENT_SCOPES,
    type SiteCheckEquipmentScope,
    SITE_CHECK_FREQUENCY_OPTIONS,
    type SiteCheckFrequency,
    type SiteCheckSchedule,
    type SiteCheckScheduleSaveInput,
} from '../site-checks/types/siteCheck.types'
import {
    calculateInitialSiteCheckDate,
    calculateNextSiteCheckDueDate,
    validateSiteCheckSchedule,
} from '../site-checks/domain/siteCheckCalculations'
import './SiteMaintenanceSettingsDrawer.css'
import './SiteSettingsDrawer.css'

export type SiteSettingsTab = 'details' | 'inductions' | 'site-checks' | 'bulk-equipment'

type Props = {
    site: Site
    equipment: Equipment[]
    busy: boolean
    error: string
    bulkImportAllowed: boolean
    siteCheckSchedule?: SiteCheckSchedule
    siteCheckSelectedEquipmentIds: string[]
    siteChecksLoading: boolean
    siteChecksSaving: boolean
    siteChecksError: string
    onSaveDetails: (name: string, address: string, greenTreeCustomerCode: string, greenTreeCustomerName: string) => Promise<void>
    onSaveInductions: (required: boolean, requirements: string) => Promise<void>
    onLoadInductionDocuments: () => Promise<SiteInductionDocument[]>
    onUploadInductionDocuments: (files: File[]) => Promise<SiteInductionDocument[]>
    onDeleteInductionDocument: (documentId: string) => Promise<SiteInductionDocument[]>
    onDownloadInductionDocument: (documentId: string) => Promise<Blob>
    onSaveSiteChecks: (input: SiteCheckScheduleSaveInput) => Promise<void>
    onDetailsComplete: (name: string) => void
    onOpenBulkImport: () => void
    onClose: () => void
}

const equipmentLabel = (item: Equipment) => item.gr_fleet || item.gr_serial || 'Unnamed Equipment'

export default function SiteSettingsDrawer({
    site,
    equipment,
    busy,
    error,
    bulkImportAllowed,
    siteCheckSchedule,
    siteCheckSelectedEquipmentIds,
    siteChecksLoading,
    siteChecksSaving,
    siteChecksError,
    onSaveDetails,
    onSaveInductions,
    onLoadInductionDocuments,
    onUploadInductionDocuments,
    onDeleteInductionDocument,
    onDownloadInductionDocument,
    onSaveSiteChecks,
    onDetailsComplete,
    onOpenBulkImport,
    onClose,
}: Props) {
    const [activeTab, setActiveTab] = useState<SiteSettingsTab>('details')
    const [name, setName] = useState(site.gr_name)
    const [address, setAddress] = useState(site.gr_address ?? '')
    const [greenTreeCustomerCode, setGreenTreeCustomerCode] = useState(site.gr_greentreecustomercode ?? '')
    const [greenTreeCustomerName, setGreenTreeCustomerName] = useState(site.gr_greentreecustomername ?? '')
    const [savedDetails, setSavedDetails] = useState({
        name: site.gr_name,
        address: site.gr_address ?? '',
        greenTreeCustomerCode: site.gr_greentreecustomercode ?? '',
        greenTreeCustomerName: site.gr_greentreecustomername ?? '',
    })
    const [inductionRequired, setInductionRequired] = useState(site.gr_inductionrequired ?? false)
    const [inductionRequirements, setInductionRequirements] = useState(site.gr_inductionrequirements ?? '')
    const [savedInductionState, setSavedInductionState] = useState({
        inductionRequired: site.gr_inductionrequired ?? false,
        inductionRequirements: site.gr_inductionrequirements ?? '',
    })
    const [inductionDocuments, setInductionDocuments] = useState<SiteInductionDocument[]>([])
    const [isLoadingInductionDocuments, setIsLoadingInductionDocuments] = useState(false)
    const [isUploadingInductionDocuments, setIsUploadingInductionDocuments] = useState(false)
    const [localError, setLocalError] = useState('')
    const [inductionDocumentError, setInductionDocumentError] = useState('')
    const [detailsSuccess, setDetailsSuccess] = useState('')
    const existingSiteCheckFrequency = siteCheckSchedule?.gr_frequency ?? '' as SiteCheckFrequency | ''
    const initialSiteChecks = {
        enabled: siteCheckSchedule?.gr_enabled ?? false,
        frequency: existingSiteCheckFrequency,
        equipmentScope: resolveSiteCheckEquipmentScope(siteCheckSchedule?.gr_equipmentscope),
        initialDate: existingSiteCheckFrequency && siteCheckSchedule?.gr_nextduedate
            ? calculateInitialSiteCheckDate(siteCheckSchedule.gr_nextduedate, existingSiteCheckFrequency)
            : '',
    }
    const currentSiteCheckEquipmentIds = siteCheckSelectedEquipmentIds.filter((id) =>
        equipment.some((item) => item.gr_equipmentid.toLowerCase() === id.toLowerCase()))
    const [siteChecksEnabled, setSiteChecksEnabled] = useState(initialSiteChecks.enabled)
    const [siteChecksFrequency, setSiteChecksFrequency] = useState<SiteCheckFrequency | ''>(
        initialSiteChecks.frequency,
    )
    const [siteChecksInitialDate, setSiteChecksInitialDate] = useState(initialSiteChecks.initialDate)
    const [siteChecksEquipmentScope, setSiteChecksEquipmentScope] =
        useState<SiteCheckEquipmentScope>(initialSiteChecks.equipmentScope)
    const [siteCheckEquipmentIds, setSiteCheckEquipmentIds] =
        useState<string[]>(currentSiteCheckEquipmentIds)
    const [savedSiteChecks, setSavedSiteChecks] = useState({
        ...initialSiteChecks,
        selectedEquipmentIds: currentSiteCheckEquipmentIds,
    })
    const [, setSiteChecksSuccess] = useState('')
    const [confirmingDisable, setConfirmingDisable] = useState(false)
    const inductionDocumentInputRef = useRef<HTMLInputElement>(null)
    const inductionRequirementsInputRef = useRef<HTMLTextAreaElement>(null)

    const resizeInductionRequirementsInput = useCallback(() => {
        const textarea = inductionRequirementsInputRef.current
        if (!textarea) return
        textarea.style.height = '0px'
        textarea.style.height = `${Math.max(120, textarea.scrollHeight)}px`
    }, [])

    const sortedEquipment = useMemo(() => [...equipment].sort((left, right) =>
        equipmentLabel(left).localeCompare(equipmentLabel(right), undefined, { numeric: true }),
    ), [equipment])
    const detailsDirty = name.trim() !== savedDetails.name.trim()
        || address.trim() !== savedDetails.address.trim()
        || greenTreeCustomerCode.trim() !== savedDetails.greenTreeCustomerCode.trim()
        || greenTreeCustomerName.trim() !== savedDetails.greenTreeCustomerName.trim()
    const inductionDirty = inductionRequired !== savedInductionState.inductionRequired
        || inductionRequirements.trim() !== savedInductionState.inductionRequirements.trim()
    const siteChecksDirty = siteChecksEnabled !== savedSiteChecks.enabled
        || siteChecksFrequency !== savedSiteChecks.frequency
        || siteChecksEquipmentScope !== savedSiteChecks.equipmentScope
        || siteChecksInitialDate !== savedSiteChecks.initialDate
        || [...siteCheckEquipmentIds].sort().join(',')
            !== [...savedSiteChecks.selectedEquipmentIds].sort().join(',')

    useEffect(() => {
        resizeInductionRequirementsInput()
    }, [inductionRequirements, resizeInductionRequirementsInput])

    const loadInductionDocuments = useCallback(async () => {
        setInductionDocumentError('')
        setIsLoadingInductionDocuments(true)
        try {
            const documents = await onLoadInductionDocuments()
            setInductionDocuments(documents)
        } catch (caught) {
            setInductionDocumentError(caught instanceof Error
                ? caught.message
                : 'Induction documents could not be loaded.')
        } finally {
            setIsLoadingInductionDocuments(false)
        }
    }, [onLoadInductionDocuments])

    const changeActiveTab = (tab: SiteSettingsTab) => {
        setLocalError('')
        setActiveTab(tab)
        if (tab === 'inductions') void loadInductionDocuments()
    }

    const downloadInductionDocument = async (inductionDocument: SiteInductionDocument) => {
        try {
            const blob = await onDownloadInductionDocument(inductionDocument.id)
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = inductionDocument.fileName || 'site-induction-document'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
        } catch (caught) {
            setInductionDocumentError(caught instanceof Error ? caught.message : 'The document could not be downloaded.')
        }
    }

    const deleteInductionDocument = async (documentId: string) => {
        setInductionDocumentError('')
        try {
            const next = await onDeleteInductionDocument(documentId)
            setInductionDocuments(next)
        } catch (caught) {
            setInductionDocumentError(caught instanceof Error
                ? caught.message
                : 'The document could not be deleted.')
        }
    }

    const uploadInductionDocuments = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? [])
        if (!files.length) return
        setInductionDocumentError('')
        setIsUploadingInductionDocuments(true)
        try {
            const next = await onUploadInductionDocuments(files)
            setInductionDocuments(next)
            if (inductionDocumentInputRef.current) inductionDocumentInputRef.current.value = ''
        } catch (caught) {
            setInductionDocumentError(caught instanceof Error
                ? caught.message
                : 'The selected documents could not be uploaded.')
        } finally {
            setIsUploadingInductionDocuments(false)
            if (inductionDocumentInputRef.current) inductionDocumentInputRef.current.value = ''
        }
    }

    const saveInductions = async () => {
        setLocalError('')
        try {
            await onSaveInductions(inductionRequired, inductionRequirements)
            setSavedInductionState({
                inductionRequired,
                inductionRequirements: inductionRequirements.trim(),
            })
            setLocalError('')
        } catch (caught) {
            setLocalError(caught instanceof Error ? caught.message : 'Induction requirements could not be saved.')
        }
    }

    const saveDetails = async (event: FormEvent) => {
        event.preventDefault()
        const normalizedName = name.trim()
        if (!normalizedName) {
            setLocalError('Enter a Site name.')
            return
        }
        setLocalError('')
        setDetailsSuccess('')
        try {
            await onSaveDetails(
                normalizedName,
                address.trim(),
                greenTreeCustomerCode.trim(),
                greenTreeCustomerName.trim(),
            )
            setSavedDetails({
                name: normalizedName,
                address: address.trim(),
                greenTreeCustomerCode: greenTreeCustomerCode.trim(),
                greenTreeCustomerName: greenTreeCustomerName.trim(),
            })
            setDetailsSuccess('Site changes saved to Dataverse.')
            onDetailsComplete(normalizedName)
        } catch (caught) {
            setLocalError(caught instanceof Error ? caught.message : 'Site changes could not be saved. Please try again.')
        }
    }

    const existingScheduleIsUnchanged = Boolean(
        siteCheckSchedule?.gr_nextduedate
        && siteChecksFrequency === initialSiteChecks.frequency
        && siteChecksInitialDate === initialSiteChecks.initialDate,
    )
    const calculatedSiteChecksDueDate = existingScheduleIsUnchanged
        ? siteCheckSchedule!.gr_nextduedate!
        : siteChecksFrequency && siteChecksInitialDate
            ? calculateNextSiteCheckDueDate(siteChecksInitialDate, siteChecksFrequency)
            : ''

    const saveSiteChecks = async () => {
        const validation = validateSiteCheckSchedule({
            enabled: siteChecksEnabled,
            frequency: siteChecksFrequency || null,
            nextDueDate: calculatedSiteChecksDueDate || null,
        })
        if (!validation.valid) {
            setLocalError(validation.errors.join(' '))
            return
        }
        if (
            siteChecksEnabled
            && siteChecksEquipmentScope === SITE_CHECK_EQUIPMENT_SCOPES.MANUAL_SELECTION
            && siteCheckEquipmentIds.length === 0
        ) {
            setLocalError('Select at least one Equipment record for Manual Selection.')
            return
        }
        setLocalError('')
        setSiteChecksSuccess('')
        try {
            await onSaveSiteChecks({
                siteId: site.gr_siteid,
                siteName: site.gr_name,
                enabled: siteChecksEnabled,
                frequency: siteChecksFrequency || null,
                equipmentScope: siteChecksEquipmentScope,
                selectedEquipmentIds: siteCheckEquipmentIds,
                nextDueDate: calculatedSiteChecksDueDate || null,
            })
            setSavedSiteChecks({
                enabled: siteChecksEnabled,
                frequency: siteChecksFrequency,
                equipmentScope: siteChecksEquipmentScope,
                initialDate: siteChecksInitialDate,
                selectedEquipmentIds: siteCheckEquipmentIds,
            })
            setConfirmingDisable(false)
            setSiteChecksSuccess('Site Check settings saved to Dataverse.')
        } catch (caught) {
            setLocalError(caught instanceof Error
                ? caught.message
                : 'Site Check settings could not be saved.')
        }
    }

    const requestClose = () => {
        if (busy) return
        if ((detailsDirty || siteChecksDirty || inductionDirty) && !window.confirm('Discard unsaved Site changes?')) return
        onClose()
    }

    const tabs = [
        { id: 'details' as const, label: 'Details', hasError: activeTab === 'details' && Boolean(localError) },
        { id: 'inductions' as const, label: 'Inductions', hasError: activeTab === 'inductions' && Boolean(inductionDirty || localError || inductionDocumentError) },
        ...(bulkImportAllowed ? [{ id: 'bulk-equipment' as const, label: 'Bulk Add Equipment' }] : []),
    ]

    return <>
        <EditDrawerShell
            eyebrow={site.gr_name}
            title="Site Settings"
            busy={busy}
            onClose={requestClose}
            footer={<>
                <span>{activeTab === 'inductions'
                        ? `${inductionDocuments.length} induction document${inductionDocuments.length === 1 ? '' : 's'}`
                    : activeTab === 'bulk-equipment'
                        ? 'Customer and Site will be selected automatically.'
                        : detailsSuccess || 'Site name and address changes save to Dataverse.'}</span>
                <div className="site-maintenance-footer-actions">
                    <button type="button" onClick={requestClose} disabled={busy}>Cancel</button>
                    {activeTab === 'details' && <button type="submit" form="site-settings-details-form" className="primary" disabled={busy || !detailsDirty}>Save changes</button>}
                    {activeTab === 'inductions' && <button type="button" className="primary" onClick={() => void saveInductions()} disabled={busy || !inductionDirty}>Save inductions</button>}
                    {activeTab === 'bulk-equipment' && <button type="button" className="primary" onClick={onOpenBulkImport}>Open bulk add</button>}
                </div>
            </>}
        >
            <DrawerTabs tabs={tabs} activeTab={activeTab} onChange={changeActiveTab} ariaLabel="Site settings sections" />

            <div role="tabpanel" aria-labelledby="drawer-tab-details" hidden={activeTab !== 'details'}>
                <form id="site-settings-details-form" onSubmit={saveDetails}>
                    <EditDrawerSection title="Site details">
                        <div className="site-settings-fields">
                            <label>Site name<input autoFocus value={name} aria-invalid={!name.trim()} onChange={(event) => { setName(event.target.value); setDetailsSuccess(''); setLocalError('') }} /></label>
                            <label>Address<input value={address} onChange={(event) => { setAddress(event.target.value); setDetailsSuccess('') }} /></label>
                        </div>
                    </EditDrawerSection>
                    <EditDrawerSection title="Default GreenTree customer">
                        <p className="site-settings-help">
                            Used as the default account when this Site is entered in GreenTree. This does not change the
                            Service Operations Customer, Site, Equipment location, or any historical GreenTree Job.
                        </p>
                        <div className="site-settings-fields">
                            <label>Customer code<input value={greenTreeCustomerCode} onChange={(event) => { setGreenTreeCustomerCode(event.target.value); setDetailsSuccess('') }} /></label>
                            <label>Customer name<input value={greenTreeCustomerName} onChange={(event) => { setGreenTreeCustomerName(event.target.value); setDetailsSuccess('') }} /></label>
                        </div>
                    </EditDrawerSection>
                </form>
            </div>

            <div role="tabpanel" aria-labelledby="drawer-tab-site-checks" hidden={activeTab !== 'site-checks'}>
                <EditDrawerSection title="Recurring Site Checks">
                    {siteChecksLoading ? <p>Loading Site Check settings…</p> : <>
                        <div className="site-checks-enable-row">
                            <div>
                                <strong>Enable Site Checks</strong>
                                <p>Include this Site in Site Check due and overdue reporting.</p>
                            </div>
                            <FormSwitch
                                label="Enable Site Checks"
                                checked={siteChecksEnabled}
                                disabled={busy || siteChecksSaving}
                                onChange={(enabled) => {
                                    setSiteChecksEnabled(enabled)
                                    setSiteChecksSuccess('')
                                    setLocalError('')
                                }}
                            />
                        </div>
                        <div className="site-settings-fields">
                            <label>
                                Frequency
                                <select
                                    value={siteChecksFrequency}
                                    disabled={busy || siteChecksSaving || !siteChecksEnabled}
                                    aria-required={siteChecksEnabled}
                                    onChange={(event) => {
                                        setSiteChecksFrequency(event.target.value
                                            ? Number(event.target.value) as SiteCheckFrequency
                                            : '')
                                        setSiteChecksSuccess('')
                                        setLocalError('')
                                    }}
                                >
                                    <option value="">Select frequency</option>
                                    {SITE_CHECK_FREQUENCY_OPTIONS.map((option) =>
                                        <option key={option.value} value={option.value}>{option.label}</option>,
                                    )}
                                </select>
                            </label>
                            <label>
                                Equipment scope
                                <select
                                    value={siteChecksEquipmentScope}
                                    disabled={busy || siteChecksSaving || !siteChecksEnabled}
                                    onChange={(event) => {
                                        setSiteChecksEquipmentScope(Number(event.target.value) as SiteCheckEquipmentScope)
                                        setSiteChecksSuccess('')
                                        setLocalError('')
                                    }}
                                >
                                    {SITE_CHECK_EQUIPMENT_SCOPE_OPTIONS.map((option) =>
                                        <option key={option.value} value={option.value}>{option.label}</option>,
                                    )}
                                </select>
                            </label>
                            <label>
                                Initial date
                                <input
                                    type="date"
                                    value={siteChecksInitialDate}
                                    disabled={busy || siteChecksSaving || !siteChecksEnabled}
                                    required={siteChecksEnabled}
                                    onChange={(event) => {
                                        setSiteChecksInitialDate(event.target.value)
                                        setSiteChecksSuccess('')
                                        setLocalError('')
                                    }}
                                />
                            </label>
                            <label>
                                First due date
                                <input
                                    type="date"
                                    value={calculatedSiteChecksDueDate}
                                    disabled
                                    readOnly
                                />
                            </label>
                        </div>
                        {siteChecksEquipmentScope === SITE_CHECK_EQUIPMENT_SCOPES.MANUAL_SELECTION && <>
                            <SearchableSelect
                                id="site-check-equipment-selector"
                                label="Equipment included"
                                value=""
                                onChange={() => undefined}
                                multiple
                                values={siteCheckEquipmentIds}
                                onValuesChange={(ids) => {
                                    setSiteCheckEquipmentIds([...new Set(ids)])
                                    setSiteChecksSuccess('')
                                    setLocalError('')
                                }}
                                options={sortedEquipment.map((item) => ({
                                    value: item.gr_equipmentid,
                                    label: [equipmentLabel(item), item.gr_make, item.gr_model]
                                        .filter(Boolean).join(' · '),
                                    secondary: item.gr_serial ? `S/N ${item.gr_serial}` : undefined,
                                    searchText: [...equipmentIdentifierSearchValues(item), item.gr_make, item.gr_model]
                                        .filter(Boolean).join(' '),
                                }))}
                                placeholder="Select Equipment"
                                searchPlaceholder="Search fleet, serial, make or model"
                                emptyLabel="No Equipment at this Site"
                                disabled={busy || siteChecksSaving || !siteChecksEnabled}
                                required={siteChecksEnabled}
                            />
                            <section className="site-check-equipment-selected" aria-labelledby="site-check-equipment-selected-heading">
                                <div>
                                    <h3 id="site-check-equipment-selected-heading">
                                        Selected Equipment <span>({siteCheckEquipmentIds.length})</span>
                                    </h3>
                                    {siteCheckEquipmentIds.length > 0 && <button
                                        type="button"
                                        onClick={() => setSiteCheckEquipmentIds([])}
                                        disabled={busy || siteChecksSaving}
                                    >Clear all</button>}
                                </div>
                                {siteCheckEquipmentIds.length === 0
                                    ? <p>No Equipment selected yet.</p>
                                    : <ul>{sortedEquipment
                                        .filter((item) => siteCheckEquipmentIds.includes(item.gr_equipmentid))
                                        .map((item) => <li key={item.gr_equipmentid}>
                                            <span>
                                                <strong>{equipmentLabel(item)}</strong>
                                                <small>{[item.gr_make, item.gr_model, item.gr_serial && `S/N ${item.gr_serial}`]
                                                    .filter(Boolean).join(' · ') || 'No machine details'}</small>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setSiteCheckEquipmentIds((ids) =>
                                                    ids.filter((id) => id !== item.gr_equipmentid))}
                                                disabled={busy || siteChecksSaving}
                                                aria-label={`Remove ${equipmentLabel(item)} from Site Check`}
                                            >Remove</button>
                                        </li>)}</ul>}
                            </section>
                        </>}
                        {!siteChecksEnabled && siteCheckSchedule && <p>
                            Existing Site Check history and generated Jobs are retained when disabled.
                        </p>}
                    </>}
                </EditDrawerSection>
            </div>

            <div role="tabpanel" aria-labelledby="drawer-tab-inductions" hidden={activeTab !== 'inductions'}>
                <EditDrawerSection title="Induction and safety requirements">
                    <div className="site-maintenance-setting site-induction-required-details">
                        <label className="site-induction-required-field">
                            <input
                                type="checkbox"
                                checked={inductionRequired}
                                onChange={(event) => {
                                    const next = event.target.checked
                                    setInductionRequired(next)
                                    setLocalError('')
                                    setInductionDocumentError('')
                                }}
                                disabled={busy}
                            />
                            Inductions are required before equipment can be used at this Site
                        </label>
                        <div hidden={!inductionRequired}>
                            <label>
                                Requirements and notes
                                <textarea
                                    ref={inductionRequirementsInputRef}
                                    value={inductionRequirements}
                                    onChange={(event) => {
                                        setInductionRequirements(event.target.value)
                                        setLocalError('')
                                        setInductionDocumentError('')
                                    }}
                                    onInput={resizeInductionRequirementsInput}
                                    rows={6}
                                    placeholder="Enter required induction/safety steps, required documentation, and any special requirements."
                                    disabled={busy}
                                />
                            </label>
                        </div>
                    </div>
                </EditDrawerSection>
                <EditDrawerSection title="Site induction documents">
                    <div className="site-maintenance-setting site-induction-documents-header">
                        <p>Upload and link induction-related forms, JSEA documents, and other safety records.</p>
                        <button
                            type="button"
                            onClick={() => inductionDocumentInputRef.current?.click()}
                            disabled={busy || isLoadingInductionDocuments || isUploadingInductionDocuments}
                        >
                            <span className={isUploadingInductionDocuments ? 'site-induction-spinner' : undefined} aria-hidden="true"></span>
                            {isUploadingInductionDocuments ? 'Uploading...' : 'Upload files'}
                        </button>
                    </div>
                    <input
                        ref={inductionDocumentInputRef}
                        type="file"
                        className="site-induction-documents-input"
                        multiple
                        onChange={(event) => void uploadInductionDocuments(event)}
                        disabled={busy || isLoadingInductionDocuments || isUploadingInductionDocuments}
                    />
                    <p>
                        {isUploadingInductionDocuments
                            ? 'Uploading induction documents…'
                            : isLoadingInductionDocuments
                            ? 'Loading documents…'
                            : `${inductionDocuments.length} document${inductionDocuments.length === 1 ? '' : 's'} available`}
                    </p>
                    {inductionDocuments.length === 0 && !isLoadingInductionDocuments
                        ? <p className="site-induction-documents-empty">No induction documents have been uploaded yet.</p>
                        : <ul className="site-induction-documents-list">
                            {inductionDocuments.map((document) => <li key={document.id}>
                                <div>
                                    <strong>{document.fileName}</strong>
                                    <small>{document.createdOn ? `Uploaded ${document.createdOn}` : 'Upload date unknown'}</small>
                                </div>
                                <div className="site-induction-documents-actions">
                                    <button type="button" onClick={() => void downloadInductionDocument(document)} disabled={busy}>Download</button>
                                    <button type="button" onClick={() => void deleteInductionDocument(document.id)} disabled={busy}>Delete</button>
                                </div>
                            </li>)}
                        </ul>}
                </EditDrawerSection>
            </div>

            <div role="tabpanel" aria-labelledby="drawer-tab-bulk-equipment" hidden={activeTab !== 'bulk-equipment'} className="site-settings-bulk-launch">
                <h3>Bulk Add Equipment</h3>
                <p>Paste, validate, review, correct, and import Equipment using the existing bulk-add workflow. The destination is already set to <strong>{site.gr_name}</strong>.</p>
            </div>
            {(localError || error || siteChecksError || inductionDocumentError) && <p className="site-maintenance-error" role="alert">{localError || error || siteChecksError || inductionDocumentError}</p>}
        </EditDrawerShell>

        {confirmingDisable && <EditDrawerConfirmation
            eyebrow="Disable Site Checks"
            title={`Disable Site Checks for ${site.gr_name}?`}
            message="The current Site Check and its Jobs remain accessible and can still be completed. This Site will leave due and overdue reporting, and no new Site Check can be started while disabled."
            error={localError || siteChecksError}
            isBusy={siteChecksSaving}
            confirmLabel={siteChecksSaving ? 'Disabling…' : 'Disable Site Checks'}
            onCancel={() => { if (!siteChecksSaving) setConfirmingDisable(false) }}
            onConfirm={() => void saveSiteChecks()}
        />}
    </>
}
