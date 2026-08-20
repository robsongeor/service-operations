const EQUIPMENT_SELECT = 'gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_serial,gr_make,gr_model,statecode,statuscode,gr_currenthourmeter,gr_currenthourmeterrecordeddate,gr_servicetrackingenabled,gr_registrationnumber,gr_compliancestatus,gr_wofrequired,gr_currentwofexpiry,gr_lastwofcompleted,gr_regoexpiry,gr_powertype,gr_serviceprogramme,gr_maintenanceprofile,gr_ownershiptype,gr_sitecheckavailability,gr_customaenabled,gr_custombenabled,gr_customcenabled,gr_customaintervaldays,gr_custombintervaldays,gr_customcintervaldays'
const EQUIPMENT_EXPAND = 'gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name))'
const SITE_SELECT = 'gr_siteid,gr_name,gr_address,gr_defaultmaintenanceprofile,gr_inductionrequired,gr_inductionrequirements,gr_geocodelatitude,gr_geocodelongitude,gr_geocodesourceaddress,gr_geocodeformattedaddress,gr_geocoderesolvedon,_gr_customer_value'
const SITE_EXPAND = 'gr_Customer($select=gr_customerid,gr_name)'
const SITE_CONTACT_EXPAND = 'gr_Site($select=gr_siteid,gr_name),gr_Contact($select=gr_contactid,gr_name,gr_phone,gr_email)'

function escapeODataString(value: string) {
    return value.replace(/'/g, "''")
}

function apiRoot(dataverseUrl: string) {
    return `${dataverseUrl.replace(/\/$/, '')}/api/data/v9.2`
}

export function buildEquipmentSearchUrl(dataverseUrl: string, query: string) {
    const normalizedQuery = query.trim()
    const escaped = escapeODataString(normalizedQuery)
    const filter = normalizedQuery
        ? `&$filter=${encodeURIComponent(`(contains(gr_fleet,'${escaped}') or contains(gr_alternatefleetnumbers,'${escaped}') or contains(gr_serial,'${escaped}') or contains(gr_make,'${escaped}') or contains(gr_model,'${escaped}'))`)}`
        : ''
    return `${apiRoot(dataverseUrl)}/gr_equipments?$select=${EQUIPMENT_SELECT}&$expand=${EQUIPMENT_EXPAND}${filter}&$orderby=gr_fleet&$top=8`
}

export function buildCustomerSearchUrl(dataverseUrl: string, query: string) {
    const normalizedQuery = query.trim()
    const filter = normalizedQuery
        ? `&$filter=${encodeURIComponent(`contains(gr_name,'${escapeODataString(normalizedQuery)}')`)}`
        : ''
    return `${apiRoot(dataverseUrl)}/gr_customers?$select=gr_customerid,gr_name${filter}&$orderby=gr_name&$top=8`
}

export function buildCustomerSitesUrl(dataverseUrl: string, customerId: string) {
    return `${apiRoot(dataverseUrl)}/gr_sites?$select=${SITE_SELECT}&$expand=${SITE_EXPAND}&$filter=_gr_customer_value eq ${customerId}`
}

export function buildSiteContactsUrl(dataverseUrl: string, siteId: string) {
    return `${apiRoot(dataverseUrl)}/gr_sitecontacts?$select=gr_sitecontactid&$expand=${SITE_CONTACT_EXPAND}&$filter=_gr_site_value eq ${siteId}`
}
