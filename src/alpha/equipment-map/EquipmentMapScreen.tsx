import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useNavigate } from 'react-router-dom'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { getSignedInUserInfo } from '../../auth/signedInUser'
import { useEquipmentManager } from '../equipment/hooks/useEquipmentManager'
import PageHeader from '../shared/page-header/PageHeader'
import { equipmentIdentity, groupEquipmentBySite } from './equipmentMap'
import { geocodeEquipmentSites } from './equipmentGeocodingApi'
import { equipmentMapCacheKey, restoreEquipmentMapCache, saveEquipmentMapCache, type CachedCoordinate } from './equipmentMapCache'
import './EquipmentMapScreen.css'

const EquipmentLocationMap = lazy(() => import('./EquipmentLocationMap'))

type StateFilter = 'active' | 'all' | 'inactive'
const normalized = (value?: string | null) => value?.trim().toLocaleLowerCase() ?? ''

export default function EquipmentMapScreen() {
    const navigate = useNavigate()
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const signedInUser = getSignedInUserInfo(account)
    const { equipment, customers, sites, isLoading, loadError, reload } = useEquipmentManager()
    const storageKey = equipmentMapCacheKey(signedInUser?.storageId || 'account-pending')
    const [coordinates, setCoordinates] = useState<Record<string, CachedCoordinate>>(() => restoreEquipmentMapCache(storageKey))
    const [geocodingError, setGeocodingError] = useState('')
    const [search, setSearch] = useState('')
    const [customerId, setCustomerId] = useState('')
    const [siteId, setSiteId] = useState('')
    const [stateFilter, setStateFilter] = useState<StateFilter>('active')
    const [selectedSiteId, setSelectedSiteId] = useState('')
    const [detailsOpen, setDetailsOpen] = useState(true)

    const groupedSites = useMemo(() => groupEquipmentBySite(equipment), [equipment])

    useEffect(() => {
        if (isLoading || loadError || geocodingError || !account || groupedSites.length === 0) return
        const missing = groupedSites
            .filter((site) => site.address && coordinates[site.siteId]?.address !== site.address)
            .slice(0, 20)
        if (!missing.length) return
        let cancelled = false
        const timer = window.setTimeout(() => {
            setGeocodingError('')
            void acquireDataverseAccessToken(instance, account)
                .then((token) => geocodeEquipmentSites(token, missing.map((site) => ({ siteId: site.siteId, address: site.address }))))
                .then((results) => {
                    if (cancelled) return
                    const providerFailureCount = results.filter((result) => result.status === 'provider_failed').length
                    setCoordinates((current) => {
                        const next = { ...current }
                        const resultsBySite = new Map(results.map((result) => [result.siteId, result]))
                        missing.forEach((site) => {
                            const result = resultsBySite.get(site.siteId)
                            if (!result || result.status === 'provider_failed') return
                            next[site.siteId] = {
                                address: site.address,
                                coordinate: result?.address === site.address ? result.coordinate : null,
                                status: result.coordinate ? 'matched' : 'not_found',
                            }
                        })
                        saveEquipmentMapCache(storageKey, next)
                        return next
                    })
                    if (providerFailureCount > 0) {
                        setGeocodingError(`The map provider failed for ${providerFailureCount} of ${missing.length} Site addresses. Check the local Geoapify key and restart Vite before retrying.`)
                    }
                })
                .catch((error) => {
                    if (!cancelled) setGeocodingError(error instanceof Error ? error.message : 'Equipment locations could not be resolved.')
                })
        }, 0)
        return () => { cancelled = true; window.clearTimeout(timer) }
    }, [account, coordinates, geocodingError, groupedSites, instance, isLoading, loadError, storageKey])

    const filteredSites = useMemo(() => {
        const query = normalized(search)
        return groupedSites.flatMap((site) => {
            if (customerId && site.customerId !== customerId) return []
            if (siteId && site.siteId !== siteId) return []
            const matchingEquipment = site.equipment.filter((item) => {
                if (stateFilter === 'active' && item.statecode !== 0) return false
                if (stateFilter === 'inactive' && item.statecode === 0) return false
                return !query || [equipmentIdentity(item), item.gr_serial, item.gr_make, item.gr_model, site.siteName, site.customerName, site.address]
                    .some((value) => normalized(value).includes(query))
            })
            if (!matchingEquipment.length) return []
            const cached = coordinates[site.siteId]
            return [{ ...site, equipment: matchingEquipment, coordinate: cached?.address === site.address ? cached.coordinate : undefined }]
        })
    }, [coordinates, customerId, groupedSites, search, siteId, stateFilter])

    const mappedSites = useMemo(() => filteredSites.filter((site) => site.coordinate), [filteredSites])
    const addressedSiteCount = groupedSites.filter((site) => site.address).length
    const resolvedAddressCount = groupedSites.filter((site) =>
        site.address && coordinates[site.siteId]?.address === site.address,
    ).length
    const pendingAddressCount = addressedSiteCount - resolvedAddressCount
    const selectedSite = filteredSites.find((site) => site.siteId === selectedSiteId) ?? filteredSites[0]
    const visibleEquipmentCount = filteredSites.reduce((total, site) => total + site.equipment.length, 0)
    const siteOptions = sites.filter((site) => !customerId || site.gr_Customer?.gr_customerid === customerId)

    return <main className="equipment-map-page">
        <PageHeader
            eyebrow="Operations"
            title="Equipment Map"
            subtitle="Current assigned Site locations—not live GPS positions."
            actions={<span className="equipment-map-total">{visibleEquipmentCount} Equipment · {filteredSites.length} Sites</span>}
        />

        <section className="equipment-map-toolbar" aria-label="Equipment map filters">
            <label className="equipment-map-search"><span>Search</span><input autoFocus type="search" value={search} placeholder="Fleet, serial, make, Site or Customer" onChange={(event) => setSearch(event.currentTarget.value)} /></label>
            <label><span>Customer</span><select value={customerId} onChange={(event) => { const next = event.currentTarget.value; setCustomerId(next); if (siteId && !sites.some((site) => site.gr_siteid === siteId && (!next || site.gr_Customer?.gr_customerid === next))) setSiteId('') }}><option value="">All Customers</option>{customers.map((customer) => <option key={customer.gr_customerid} value={customer.gr_customerid}>{customer.gr_name}</option>)}</select></label>
            <label><span>Site</span><select value={siteId} onChange={(event) => setSiteId(event.currentTarget.value)}><option value="">All Sites</option>{siteOptions.map((site) => <option key={site.gr_siteid} value={site.gr_siteid}>{site.gr_name || 'Unnamed Site'}</option>)}</select></label>
            <label><span>State</span><select value={stateFilter} onChange={(event) => setStateFilter(event.currentTarget.value as StateFilter)}><option value="active">Active Equipment</option><option value="all">All Equipment</option><option value="inactive">Inactive Equipment</option></select></label>
        </section>

        {isLoading ? <section className="equipment-map-state">Loading Equipment locations…</section> : loadError ? <section className="equipment-map-state error"><div><strong>Equipment locations could not be loaded.</strong><p>{loadError}</p></div><button type="button" onClick={() => void reload()}>Try again</button></section> : <>
            {pendingAddressCount > 0 && !geocodingError && <p className="equipment-map-notice" role="status">Resolving Site addresses… {resolvedAddressCount} of {addressedSiteCount} · {mappedSites.length} mapped</p>}
            {geocodingError && <p className="equipment-map-notice warning" role="alert">{geocodingError} Any locations already resolved remain available.</p>}
            <div className="equipment-map-layout">
                <Suspense fallback={<div className="equipment-map-canvas-shell"><div className="equipment-map-overlay">Loading map…</div></div>}>
                    <EquipmentLocationMap
                        sites={mappedSites}
                        selectedSiteId={selectedSite?.siteId ?? ''}
                        onSelectSite={(nextSiteId) => { setSelectedSiteId(nextSiteId); setDetailsOpen(true) }}
                    />
                </Suspense>
                {detailsOpen && <aside className="equipment-map-details" aria-label="Equipment at selected Site">
                    {selectedSite ? <>
                        <header>
                            <button type="button" className="equipment-map-details-close" aria-label="Close Site details" onClick={() => setDetailsOpen(false)}>×</button>
                            <span>{selectedSite.customerName}</span><h2>{selectedSite.siteName}</h2><p>{selectedSite.address || 'No address recorded'}</p>
                        </header>
                        <ul>{selectedSite.equipment.map((item) => <li key={item.gr_equipmentid}><button type="button" onClick={() => navigate(`/equipment?equipmentId=${encodeURIComponent(item.gr_equipmentid)}`)}><strong>{equipmentIdentity(item)}</strong><span>{[item.gr_make, item.gr_model, item.gr_serial].filter(Boolean).join(' · ') || 'No additional identity recorded'}</span></button></li>)}</ul>
                    </> : <div className="equipment-map-empty"><strong>No Equipment matches these filters.</strong><p>Change the filters to show Site locations.</p></div>}
                </aside>}
            </div>
        </>}
    </main>
}
