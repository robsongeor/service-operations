import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useNavigate } from 'react-router-dom'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { getSignedInUserInfo } from '../../auth/signedInUser'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import PageHeader from '../shared/page-header/PageHeader'
import { equipmentMapCacheKey, restoreEquipmentMapCache, saveEquipmentMapCache, type CachedCoordinate } from '../equipment-map/equipmentMapCache'
import { geocodeEquipmentSites } from '../equipment-map/equipmentGeocodingApi'
import { JOB_STATUSES, type JobStatus } from '../jobs/types/jobStatus.types'
import { groupJobsBySite, isJobMapStatus, jobMapMarkerTone, jobMapStatusLabel, jobsWithoutSite } from './jobMap'
import { useJobMapData } from './useJobMapData'
import '../equipment-map/EquipmentMapScreen.css'
import './JobMapScreen.css'

const JobLocationMap = lazy(() => import('./JobLocationMap'))
const normalized = (value?: string | null) => value?.trim().toLocaleLowerCase() ?? ''

const statusFilters: Array<{ value: JobStatus; label: string; tone: string }> = [
    { value: JOB_STATUSES.ALLOCATED, label: 'Allocated', tone: 'allocated' },
    { value: JOB_STATUSES.UNALLOCATED, label: 'Unallocated', tone: 'unallocated' },
    { value: JOB_STATUSES.WAITING_FOR_PARTS, label: 'Waiting for parts', tone: 'waiting' },
]

function jobEquipmentIdentity(job: ReturnType<typeof jobsWithoutSite>[number]) {
    const equipment = job.gr_Equipment
    return equipment?.gr_fleet || equipment?.gr_serial || [equipment?.gr_make, equipment?.gr_model].filter(Boolean).join(' ') || 'No Equipment'
}

export default function JobMapScreen() {
    const navigate = useNavigate()
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const signedInUser = getSignedInUserInfo(account)
    const storageId = signedInUser?.storageId || 'account-pending'
    const storageKey = equipmentMapCacheKey(storageId, import.meta.env.VITE_DATAVERSE_URL)
    const [coordinates, setCoordinates] = useState<Record<string, CachedCoordinate>>({})
    const [sharedResolutionAttempts, setSharedResolutionAttempts] = useState<Record<string, string>>({})
    const [cacheReady, setCacheReady] = useState(false)
    const [geocodingError, setGeocodingError] = useState('')
    const [search, setSearch] = useState('')
    const [customerId, setCustomerId] = useState('')
    const [siteId, setSiteId] = useState('')
    const [enabledStatuses, setEnabledStatuses] = useState<Record<number, boolean>>({
        [JOB_STATUSES.ALLOCATED]: true,
        [JOB_STATUSES.UNALLOCATED]: true,
        [JOB_STATUSES.WAITING_FOR_PARTS]: true,
    })
    const [selectedSiteId, setSelectedSiteId] = useState('')
    const [detailsOpen, setDetailsOpen] = useState(true)
    const requestedStatuses = useMemo(
        () => statusFilters.filter((status) => enabledStatuses[status.value]).map((status) => status.value),
        [enabledStatuses],
    )
    const jobMapData = useJobMapData(requestedStatuses)
    const jobs = jobMapData.jobs

    const targetJobs = useMemo(() => jobs.filter((job) => isJobMapStatus(job.gr_status)), [jobs])
    const groupedSites = useMemo(() => groupJobsBySite(targetJobs), [targetJobs])
    const sharedCoordinates = useMemo(() => Object.fromEntries(targetJobs.flatMap((job) => {
        const site = job.gr_Site
        if (!site?.gr_siteid) return []
        const address = site.gr_address?.trim() || ''
        const resolved = Boolean(address && site.gr_geocodesourceaddress === address && site.gr_geocoderesolvedon)
        const coordinate = resolved && typeof site.gr_geocodelatitude === 'number' && typeof site.gr_geocodelongitude === 'number'
            ? { latitude: site.gr_geocodelatitude, longitude: site.gr_geocodelongitude, formattedAddress: site.gr_geocodeformattedaddress || address }
            : null
        return resolved ? [[site.gr_siteid, { address, coordinate, status: coordinate ? 'matched' as const : 'not_found' as const }]] : []
    })), [targetJobs])
    const effectiveCoordinates = useMemo(() => ({ ...coordinates, ...sharedCoordinates }), [coordinates, sharedCoordinates])

    useEffect(() => {
        let cancelled = false
        void restoreEquipmentMapCache(storageKey, storageId).then((cached) => {
            if (!cancelled) { setCoordinates(cached); setCacheReady(true) }
        })
        return () => { cancelled = true }
    }, [storageId, storageKey])

    useEffect(() => {
        if (!cacheReady || !account || groupedSites.length === 0) return
        const missing = groupedSites.filter((site) => site.address
            && sharedCoordinates[site.siteId]?.address !== site.address
            && sharedResolutionAttempts[site.siteId] !== site.address).slice(0, 20)
        if (!missing.length) return
        let cancelled = false
        const timer = window.setTimeout(() => {
            setGeocodingError('')
            void acquireDataverseAccessToken(instance, account)
                .then((token) => geocodeEquipmentSites(token, missing.map((site) => ({ siteId: site.siteId, address: site.address }))))
                .then((results) => {
                    if (cancelled) return
                    const providerFailureCount = results.filter((result) => result.status === 'provider_failed').length
                    setSharedResolutionAttempts((current) => ({ ...current, ...Object.fromEntries(results.map((result) => [result.siteId, result.address])) }))
                    setCoordinates((current) => {
                        const next = { ...current }
                        const resultsBySite = new Map(results.map((result) => [result.siteId, result]))
                        missing.forEach((site) => {
                            const result = resultsBySite.get(site.siteId)
                            if (!result || result.status === 'provider_failed') return
                            next[site.siteId] = { address: site.address, coordinate: result.address === site.address ? result.coordinate : null, status: result.coordinate ? 'matched' : 'not_found' }
                        })
                        void saveEquipmentMapCache(storageKey, next)
                        return next
                    })
                    if (providerFailureCount) setGeocodingError(`The map provider failed for ${providerFailureCount} of ${missing.length} Site addresses.`)
                })
                .catch((error) => { if (!cancelled) setGeocodingError(error instanceof Error ? error.message : 'Job locations could not be resolved.') })
        }, 0)
        return () => { cancelled = true; window.clearTimeout(timer) }
    }, [account, cacheReady, groupedSites, instance, sharedCoordinates, sharedResolutionAttempts, storageKey])

    const filteredSites = useMemo(() => {
        const query = normalized(search)
        return groupedSites.flatMap((site) => {
            if (customerId && site.customerId !== customerId) return []
            if (siteId && site.siteId !== siteId) return []
            const matchingJobs = site.jobs.filter((job) => enabledStatuses[job.gr_status] && (!query || [
                job.gr_jobnumber, job.gr_description, job.gr_Equipment?.gr_fleet, job.gr_Equipment?.gr_alternatefleetnumbers,
                job.gr_Equipment?.gr_serial, job.gr_Equipment?.gr_make, job.gr_Equipment?.gr_model,
                job.gr_Mechanic?.gr_name, site.siteName, site.customerName, site.address,
            ].some((value) => normalized(value).includes(query))))
            if (!matchingJobs.length) return []
            const statuses = matchingJobs.map((job) => job.gr_status)
            const markerTone = jobMapMarkerTone(statuses)
            const cached = effectiveCoordinates[site.siteId]
            return [{ ...site, jobs: matchingJobs, statuses, markerTone, coordinate: cached?.address === site.address ? cached.coordinate : undefined }]
        })
    }, [customerId, effectiveCoordinates, enabledStatuses, groupedSites, search, siteId])

    const mappedSites = filteredSites.filter((site) => site.coordinate)
    const selectedSite = filteredSites.find((site) => site.siteId === selectedSiteId) ?? filteredSites[0]
    const visibleJobCount = filteredSites.reduce((sum, site) => sum + site.jobs.length, 0)
    const enabledTargetJobs = targetJobs.filter((job) => enabledStatuses[job.gr_status])
    const missingSiteCount = jobsWithoutSite(enabledTargetJobs).length
    const unmappedJobCount = missingSiteCount + filteredSites.filter((site) => !site.coordinate).reduce((sum, site) => sum + site.jobs.length, 0)
    const addressedSites = groupedSites.filter((site) => site.address)
    const resolvedAddressCount = addressedSites.filter((site) => effectiveCoordinates[site.siteId]?.address === site.address).length
    const pendingAddressCount = addressedSites.length - resolvedAddressCount
    const customers = useMemo(() => [...new Map(groupedSites.filter((site) => site.customerId).map((site) => [site.customerId, site.customerName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [groupedSites])
    const siteOptions = groupedSites.filter((site) => !customerId || site.customerId === customerId)

    return <main className="equipment-map-page job-map-page">
        <PageHeader eyebrow="Operations" title="Job Map" subtitle="Current Job Site locations—not live technician or Equipment positions."
            actions={<span className="equipment-map-total">{visibleJobCount} Jobs · {filteredSites.length} Sites</span>} />
        <section className="equipment-map-toolbar job-map-toolbar" aria-label="Job map filters">
            <label className="equipment-map-search"><span>Search</span><input autoFocus type="search" value={search} placeholder="Job, description, Equipment, Site, Customer or mechanic" onChange={(event) => setSearch(event.currentTarget.value)} /></label>
            <label><span>Customer</span><select value={customerId} onChange={(event) => { setCustomerId(event.currentTarget.value); setSiteId('') }}><option value="">All Customers</option>{customers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
            <label><span>Site</span><select value={siteId} onChange={(event) => setSiteId(event.currentTarget.value)}><option value="">All Sites</option>{siteOptions.map((site) => <option key={site.siteId} value={site.siteId}>{site.siteName}</option>)}</select></label>
            <fieldset className="job-map-status-filter"><legend>Status</legend>{statusFilters.map((status) => <label key={status.value} className={status.tone}><input type="checkbox" checked={enabledStatuses[status.value]} onChange={(event) => { const checked = event.currentTarget.checked; setEnabledStatuses((current) => ({ ...current, [status.value]: checked })) }} /><span>{status.label}</span></label>)}</fieldset>
        </section>
        {jobMapData.isLoading ? <section className="equipment-map-state">Loading Job locations…</section> : jobMapData.loadError ? <section className="equipment-map-state error"><div><strong>Job locations could not be loaded.</strong><p>{jobMapData.loadError}</p></div><button type="button" onClick={() => { void jobMapData.refetch() }}>Try again</button></section> : <>
            {jobMapData.isRefreshing && <p className="equipment-map-notice" role="status">Updating Job locations…</p>}
            {jobMapData.refreshError && <p className="equipment-map-notice warning" role="alert">Job locations could not be refreshed. The last available locations remain visible.</p>}
            {pendingAddressCount > 0 && !geocodingError && <p className="equipment-map-notice" role="status">Resolving Site addresses… {resolvedAddressCount} of {addressedSites.length} · {mappedSites.length} mapped</p>}
            {geocodingError && <p className="equipment-map-notice warning" role="alert">{geocodingError} Any locations already resolved remain available.</p>}
            {unmappedJobCount > 0 && pendingAddressCount === 0 && <p className="equipment-map-notice warning">{unmappedJobCount} matching {unmappedJobCount === 1 ? 'Job is' : 'Jobs are'} not mapped because no usable Site location is available.</p>}
            <div className="equipment-map-layout">
                <Suspense fallback={<div className="equipment-map-canvas-shell"><div className="equipment-map-overlay">Loading map…</div></div>}>
                    <JobLocationMap sites={mappedSites} viewportKey={`${normalized(search)}|${customerId}|${siteId}|${Object.entries(enabledStatuses).filter(([, on]) => on).map(([status]) => status).join(',')}`} selectedSiteId={selectedSite?.siteId ?? ''} onSelectSite={(next) => { setSelectedSiteId(next); setDetailsOpen(true) }} />
                </Suspense>
                {detailsOpen && <aside className="equipment-map-details job-map-details" aria-label="Jobs at selected Site">
                    {selectedSite ? <><header><button type="button" className="equipment-map-details-close" aria-label="Close Site details" onClick={() => setDetailsOpen(false)}>×</button><span>{selectedSite.customerName}</span><h2>{selectedSite.siteName}</h2><p>{selectedSite.address || 'No address recorded'}</p></header>
                        <ul>{selectedSite.jobs.map((job) => <li key={job.gr_jobid}><button type="button" onClick={() => navigate(`/jobs?jobId=${encodeURIComponent(job.gr_jobid)}`)}><span className={`job-map-status status-${job.gr_status}`}>{jobMapStatusLabel(job.gr_status)}</span><strong>Job {job.gr_jobnumber || 'No number'} · {jobEquipmentIdentity(job)}</strong><span>{job.gr_description || 'No description'}{job.gr_Mechanic?.gr_name ? ` · ${job.gr_Mechanic.gr_name}` : ''}</span></button></li>)}</ul>
                    </> : <div className="equipment-map-empty"><strong>No Jobs match these filters.</strong><p>Select at least one status or change the filters.</p></div>}
                </aside>}
            </div>
        </>}
    </main>
}
