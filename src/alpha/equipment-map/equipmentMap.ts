import type { Equipment } from '../jobs/types/equipment.types'
import type { EquipmentMapSite } from './equipmentMap.types'

export function equipmentIdentity(equipment: Equipment) {
    return equipment.gr_fleet || equipment.gr_serial || [equipment.gr_make, equipment.gr_model].filter(Boolean).join(' ') || 'Unnamed Equipment'
}

export function groupEquipmentBySite(equipment: Equipment[]): EquipmentMapSite[] {
    const sites = new Map<string, EquipmentMapSite>()
    for (const item of equipment) {
        const site = item.gr_Site
        if (!site?.gr_siteid) continue
        const existing = sites.get(site.gr_siteid)
        if (existing) existing.equipment.push(item)
        else sites.set(site.gr_siteid, {
            siteId: site.gr_siteid,
            siteName: site.gr_name || 'Unnamed Site',
            address: site.gr_address?.trim() || '',
            customerId: site.gr_Customer?.gr_customerid || '',
            customerName: site.gr_Customer?.gr_name || 'Unknown Customer',
            equipment: [item],
        })
    }
    return [...sites.values()]
        .map((site) => ({ ...site, equipment: site.equipment.sort((a, b) => equipmentIdentity(a).localeCompare(equipmentIdentity(b), undefined, { numeric: true })) }))
        .sort((a, b) => a.customerName.localeCompare(b.customerName) || a.siteName.localeCompare(b.siteName))
}
