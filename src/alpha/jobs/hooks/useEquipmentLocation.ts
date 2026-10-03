import { useCallback, useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import { applicationAccessFromEnvironment } from '../../../auth/applicationAccess'
import { fetchEquipmentById, updateEquipmentSite } from '../services/equipmentApi'
import { createSite, fetchCustomerSites, fetchLocationSite } from '../services/sitesApi'
import { createCustomer, findCustomersByName, searchCustomers } from '../services/customersApi'
import { createEquipmentDestination, createEquipmentSite, moveEquipmentLocation, type EquipmentDestinationInput } from '../../equipment/services/equipmentLocationWorkflow'
import type { Equipment } from '../types/equipment.types'
import type { Customer } from '../types/customer.types'
import type { Site } from '../types/site.types'
import { useOperationalDataClient } from '../../shared/data/OperationalDataClientContext'
import { EQUIPMENT_OPERATIONAL_LIST_QUERY_KEY } from '../../shared/data/operationalCollectionKeys'
import { invalidateOperationalQueries } from '../../shared/data/OperationalDataClient'
import { jobBookEquipmentIndexScope, sharedJobBookEquipmentIndexCache, deletePersistedJobBookEquipmentIndex } from '../../job-book/jobBookEquipmentIndexCache'

export function useEquipmentLocation(equipment: Equipment, onLocationChange: (row: Equipment) => void) {
    const { instance } = useMsal()
    const dataClient = useOperationalDataClient()
    const account = useActiveMsalAccount()
    const access = applicationAccessFromEnvironment(account)
    const canMove = access.canMoveEquipment
    const canCreateDestination = access.canCreateEquipmentDestination
    const getToken = useCallback(() => acquireDataverseAccessToken(instance, account), [instance, account])
    const changed = useRef(onLocationChange)
    useEffect(() => { changed.current = onLocationChange }, [onLocationChange])
    const [record, setRecord] = useState(equipment)
    const [editing, setEditing] = useState(!equipment.gr_Site?.gr_Customer)
    const [customer, setCustomer] = useState<Customer | undefined>(equipment.gr_Site?.gr_Customer)
    const [query, setQuery] = useState(customer?.gr_name ?? '')
    const [siteId, setSiteId] = useState(equipment.gr_Site?.gr_siteid ?? '')
    const [sites, setSites] = useState<Site[]>([])
    const [siteStatus, setSiteStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
    const [siteAttempt, setSiteAttempt] = useState(0)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [creatingDestination, setCreatingDestination] = useState(false)
    const destinationInFlight = useRef(false)
    const rememberedCustomer = useRef<Customer | undefined>(undefined)
    const createdSite = useRef<Site | undefined>(undefined)
    const [error, setError] = useState('')
    const [attempt, setAttempt] = useState(0)
    const [notice, setNotice] = useState('')
    const editAfterRefresh = useRef(false)
    const alive = useRef(true)
    useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
    const equipmentId = equipment.gr_equipmentid

    // One exact read; old equipment/customer requests cannot populate the next selection.
    useEffect(() => {
        const controller = new AbortController()
        const timer = setTimeout(() => {
            setLoading(true)
            setError('')
            void getToken().then((token) => fetchEquipmentById(token, equipmentId, controller.signal)).then((row) => {
                if (controller.signal.aborted) return
                if (!row) throw new Error('Equipment could not be found. Choose another machine.')
                if (!row['@odata.etag']) throw new Error('Equipment version is unavailable.')
                setRecord(row)
                setCustomer(row.gr_Site?.gr_Customer)
                setQuery(row.gr_Site?.gr_Customer?.gr_name ?? '')
                setSiteId(row.gr_Site?.gr_siteid ?? '')
                setEditing(editAfterRefresh.current || !row.gr_Site?.gr_Customer)
                editAfterRefresh.current = false
                changed.current(row)
            }).catch(() => {
                if (!controller.signal.aborted) setError('The current equipment location could not be loaded. Refresh before continuing.')
            }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
        }, 0)
        return () => { clearTimeout(timer); controller.abort() }
    }, [equipmentId, getToken, attempt])

    const customerId = customer?.gr_customerid ?? ''
    useEffect(() => {
        const controller = new AbortController()
        const timer = setTimeout(() => {
            const newlyCreated = createdSite.current?.gr_Customer?.gr_customerid === customerId ? createdSite.current : undefined
            setSites(newlyCreated ? [newlyCreated] : [])
            if (!editing || !customerId) { setSiteStatus('idle'); return }
            setSiteStatus('loading')
            void getToken().then((token) => fetchCustomerSites(token, customerId, controller.signal)).then((rows) => {
                if (controller.signal.aborted) return
                // A read started before creation must not remove the newly confirmed destination.
                const confirmedSite = createdSite.current?.gr_Customer?.gr_customerid === customerId ? createdSite.current : undefined
                setSites(confirmedSite && !rows.some((row) => row.gr_siteid === confirmedSite.gr_siteid) ? [confirmedSite, ...rows] : rows)
                setSiteStatus('ready')
                if (rows.length === 1) setSiteId((current) => current || rows[0].gr_siteid)
            }).catch(() => { if (!controller.signal.aborted) setSiteStatus('error') })
        }, 0)
        return () => { clearTimeout(timer); controller.abort() }
    }, [customerId, editing, getToken, siteAttempt])

    const search = useCallback(async (text: string, signal?: AbortSignal) => searchCustomers(await getToken(), text, signal), [getToken])
    const runDestinationCreation = async (create: (token: string) => Promise<{ customer: Customer; site: Site }>) => {
        if (!canMove || !canCreateDestination) throw new Error('You do not have permission to create an equipment destination.')
        if (destinationInFlight.current || saving || loading) throw new Error('Wait for the current location operation to finish.')
        destinationInFlight.current = true
        setCreatingDestination(true)
        try {
            const token = await getToken()
            const created = await create(token)
            if (alive.current) {
                createdSite.current = created.site
                setCustomer(created.customer); setQuery(created.customer.gr_name); setSiteId(created.site.gr_siteid)
                setSites((current) => [...current.filter((row) => row.gr_Customer?.gr_customerid === created.customer.gr_customerid && row.gr_siteid !== created.site.gr_siteid), created.site])
                setSiteStatus('ready'); setError('')
                setNotice('Destination saved. Select Save equipment location to move the machine.')
            }
        } finally {
            invalidateOperationalQueries((key) => key[0] === 'customer-dashboard')
            destinationInFlight.current = false
            if (alive.current) setCreatingDestination(false)
        }
    }
    const createDestination = (input: EquipmentDestinationInput) => runDestinationCreation((token) => createEquipmentDestination(input, canCreateDestination, {
        findCustomers: (name) => rememberedCustomer.current?.gr_name.trim().toLocaleLowerCase('en-NZ') === name.toLocaleLowerCase('en-NZ')
            ? Promise.resolve([rememberedCustomer.current]) : findCustomersByName(token, name),
        createCustomer: (value) => createCustomer(token, value),
        rememberCustomer: (value) => { rememberedCustomer.current = value },
        readSites: (id) => fetchCustomerSites(token, id),
        createSite: (value) => createSite(token, value),
    }))
    const createSiteDestination = async (input: { name: string; address: string }) => {
        if (!customer) throw new Error('Select a Customer before creating a Site.')
        const selectedCustomer = customer
        await runDestinationCreation(async (token) => ({
            customer: selectedCustomer,
            site: await createEquipmentSite(selectedCustomer, input, canCreateDestination, {
                readSites: (id) => fetchCustomerSites(token, id),
                createSite: (value) => createSite(token, value),
            }),
        }))
    }
    const chooseCustomer = (next?: Customer) => { setCustomer(next); if (next) setQuery(next.gr_name); setSiteId(''); setError('') }
    const cancel = () => {
        setCustomer(record.gr_Site?.gr_Customer)
        setQuery(record.gr_Site?.gr_Customer?.gr_name ?? '')
        setSiteId(record.gr_Site?.gr_siteid ?? '')
        setEditing(!record.gr_Site?.gr_Customer)
        setError('')
    }
    const save = async () => {
        if (saving || loading || destinationInFlight.current || !canMove) return
        setSaving(true); setError(''); setNotice('')
        try {
            const token = await getToken()
            const updated = await moveEquipmentLocation(record, { customerId, siteId }, canMove, {
                readSite: (id) => fetchLocationSite(token, id),
                writeSite: (id, destination, etag) => updateEquipmentSite(token, id, destination, undefined, etag),
            })
            const scope = jobBookEquipmentIndexScope(token)
            sharedJobBookEquipmentIndexCache.invalidate(scope)
            void deletePersistedJobBookEquipmentIndex(scope)
            const currentEquipment = dataClient.getState<Equipment[]>(EQUIPMENT_OPERATIONAL_LIST_QUERY_KEY).data
            if (currentEquipment) dataClient.setQueryData(EQUIPMENT_OPERATIONAL_LIST_QUERY_KEY,
                currentEquipment.map((row) => row.gr_equipmentid === updated.gr_equipmentid ? updated : row))
            if (!alive.current) return
            setRecord(updated)
            setEditing(false)
            setNotice('Equipment location saved. Previous jobs are unchanged.')
            changed.current(updated)
        } catch (failure) {
            if (alive.current) setError(failure instanceof Error ? failure.message : 'Equipment location could not be saved.')
        } finally { if (alive.current) setSaving(false) }
    }
    const pending = loading || Boolean(error) || (editing && Boolean(record.gr_Site?.gr_Customer || customerId || query.trim()))
    return {
        record, editing, customer, query, siteId, sites, siteStatus, loading, saving, error, notice, canMove, pending,
        canCreateDestination, createDestination, createSiteDestination, creatingDestination,
        search, chooseCustomer, setQuery, setSiteId, save, cancel,
        retrySites: () => setSiteAttempt((value) => value + 1),
        refresh: () => setAttempt((value) => value + 1),
        edit: () => {
            setNotice('')
            if (!record['@odata.etag']) { editAfterRefresh.current = true; setAttempt((value) => value + 1); return }
            setEditing(true)
        },
    }
}
