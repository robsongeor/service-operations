import { useEffect, useRef, useState } from 'react'
import L, { type Map as LeafletMap, type Marker as LeafletMarker } from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import type { JobMapSite } from './jobMap.types'

type Props = {
    sites: JobMapSite[]
    viewportKey: string
    selectedSiteId: string
    onSelectSite: (siteId: string) => void
}

type SiteMarker = { siteId: string; marker: LeafletMarker }
const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const NEW_ZEALAND_CENTER: [number, number] = [-41, 172.5]

function markerIcon(site: JobMapSite, selected: boolean) {
    return L.divIcon({
        className: `equipment-map-marker-host job-map-marker-host ${site.markerTone}${selected ? ' selected' : ''}`,
        html: `<span class="equipment-map-marker">${site.jobs.length}</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
    })
}

export default function JobLocationMap({ sites, viewportKey, selectedSiteId, onSelectSite }: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<LeafletMap | null>(null)
    const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)
    const markersRef = useRef<SiteMarker[]>([])
    const fittedViewportKeyRef = useRef<string | null>(null)
    const onSelectSiteRef = useRef(onSelectSite)
    const [mapReady, setMapReady] = useState(false)
    const [mapError, setMapError] = useState('')

    useEffect(() => { onSelectSiteRef.current = onSelectSite }, [onSelectSite])
    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        let map: LeafletMap | null = null
        let resizeObserver: ResizeObserver | null = null
        let resizeFrame = 0
        try {
            map = L.map(container, { center: NEW_ZEALAND_CENTER, zoom: 5, zoomControl: true, attributionControl: true })
            L.tileLayer(import.meta.env.VITE_EQUIPMENT_MAP_TILE_URL || DEFAULT_TILE_URL, {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
            }).addTo(map)
            map.attributionControl.setPrefix(false)
            map.attributionControl.setPosition('bottomleft')
            mapRef.current = map
            const createdMap = map
            resizeObserver = new ResizeObserver(() => createdMap.invalidateSize({ pan: false }))
            resizeObserver.observe(container)
            resizeFrame = window.requestAnimationFrame(() => { createdMap.invalidateSize({ pan: false }); setMapReady(true) })
        } catch {
            window.setTimeout(() => setMapError('The interactive map could not be started in this browser.'), 0)
        }
        return () => {
            window.cancelAnimationFrame(resizeFrame)
            resizeObserver?.disconnect()
            markersRef.current = []
            clusterGroupRef.current = null
            map?.remove()
            mapRef.current = null
        }
    }, [])

    useEffect(() => {
        const map = mapRef.current
        if (!map || !mapReady) return
        clusterGroupRef.current?.remove()
        clusterGroupRef.current = null
        markersRef.current = []
        const mappedSites = sites.filter((site) => site.coordinate)
        if (!mappedSites.length) return
        const shouldFitBounds = fittedViewportKeyRef.current !== viewportKey
        try {
            const bounds = L.latLngBounds([])
            const clusterGroup = L.markerClusterGroup({
                animate: false,
                showCoverageOnHover: false,
                spiderfyOnMaxZoom: true,
                zoomToBoundsOnClick: true,
                maxClusterRadius: 48,
                iconCreateFunction: (cluster) => {
                    const count = cluster.getChildCount()
                    const size = count < 10 ? 38 : count < 100 ? 44 : 50
                    return L.divIcon({
                        className: 'equipment-map-cluster-host',
                        html: `<span>${count}<small>sites</small></span>`,
                        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
                    })
                },
            })
            markersRef.current = mappedSites.map((site) => {
                const coordinate = site.coordinate!
                const marker = L.marker([coordinate.latitude, coordinate.longitude], {
                    icon: markerIcon(site, false), keyboard: true,
                    title: `${site.customerName} · ${site.siteName} · ${site.jobs.length} Jobs`, riseOnHover: true,
                }).on('click', () => onSelectSiteRef.current(site.siteId))
                clusterGroup.addLayer(marker)
                bounds.extend([coordinate.latitude, coordinate.longitude])
                return { siteId: site.siteId, marker }
            })
            clusterGroup.addTo(map)
            clusterGroupRef.current = clusterGroup
            if (shouldFitBounds) {
                if (mappedSites.length === 1) map.setView(bounds.getCenter(), 13)
                else map.fitBounds(bounds, { padding: [64, 64], maxZoom: 13, animate: false })
                fittedViewportKeyRef.current = viewportKey
            }
            map.invalidateSize({ pan: false })
        } catch {
            window.setTimeout(() => setMapError('The mapped Job Site markers could not be displayed.'), 0)
        }
    }, [mapReady, sites, viewportKey])

    useEffect(() => {
        markersRef.current.forEach(({ siteId, marker }) => marker.getElement()?.classList.toggle('selected', siteId === selectedSiteId))
    }, [selectedSiteId, sites])

    return <div className="equipment-map-canvas-shell">
        <div ref={containerRef} className="equipment-map-canvas" aria-label="Map of Job Site locations" />
        {!mapReady && !mapError && <div className="equipment-map-overlay">Loading map…</div>}
        {mapError && <div className="equipment-map-overlay error" role="alert">{mapError}</div>}
    </div>
}
