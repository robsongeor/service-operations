import { useState } from 'react'
import CustomerRelationshipPicker from '../../shared/customer-relationship/CustomerRelationshipPicker'
import { useCustomerSearch, type SearchCustomers } from '../hooks/useCustomerSearch'
import type { Customer } from '../types/customer.types'

type Props = {
    id: string
    required?: boolean
    error?: string
    query: string
    selectedId: string
    customers: readonly Customer[]
    onQueryChange: (query: string) => void
    onClearSelection: () => void
    onSelect: (customer: Customer) => void
    onSearchCustomers?: SearchCustomers
    onCreateCustomerAndSite?: (input: { customerName: string; siteName: string; address: string }) => Promise<void>
    onCreateOpenChange?: (open: boolean) => void
    createDescription?: string
    createActionLabel?: string
}

// Canonical Customer field: shared presentation plus bounded search, never feature writes.
export default function JobCustomerField({ customers, onSearchCustomers, onSelect, ...props }: Props) {
    const [open, setOpen] = useState(false)
    const search = useCustomerSearch({ query: props.query, open, customers, onSearchCustomers })
    return <CustomerRelationshipPicker
        {...props}
        options={search.results.map((customer) => ({ id: customer.gr_customerid, label: customer.gr_name }))}
        onOpenChange={setOpen}
        onSelect={(id) => {
            const customer = search.results.find((item) => item.gr_customerid === id)
            if (customer) onSelect(customer)
        }}
        searchStatus={search.status}
        emptyLabel={search.emptyLabel}
        onRetrySearch={search.retry}
    />
}
