import { useMemo, useState } from 'react'
import PricingItemDialog from './components/PricingItemDialog'
import { usePricingItems } from './hooks/usePricingItems'
import {
    PRICING_CATEGORY_LABELS,
    type PricingItem,
    type PricingItemInput,
} from './types/pricing.types'
import './PricingScreen.css'
import EditDrawerConfirmation from '../shared/drawer/EditDrawerConfirmation'
import '../shared/drawer/EditDrawer.css'

const currencyFormatter = new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
})

export default function PricingScreen() {
    const {
        items,
        isLoading,
        isSaving,
        loadError,
        saveError,
        reload,
        clearSaveError,
        createItem,
        updateItem,
        setItemActive,
        deleteItem,
    } = usePricingItems()
    const [editingItem, setEditingItem] = useState<PricingItem | null | undefined>(undefined)
    const [search, setSearch] = useState('')
    const [showInactive, setShowInactive] = useState(false)
    const [deletingItem, setDeletingItem] = useState<PricingItem | null>(null)

    const visibleItems = useMemo(() => {
        const query = search.trim().toLowerCase()
        return items.filter((item) => {
            if (!showInactive && item.statecode !== 0) return false
            if (!query) return true
            return [item.gr_name, item.gr_code, item.gr_description, item.gr_unitlabel]
                .some((value) => value?.toLowerCase().includes(query))
        })
    }, [items, search, showInactive])

    const closeDialog = () => {
        clearSaveError()
        setEditingItem(undefined)
    }

    const saveItem = async (input: PricingItemInput) => {
        try {
            if (editingItem) {
                await updateItem(editingItem.gr_pricingitemid, input)
            } else {
                await createItem(input)
            }
            closeDialog()
        } catch {
            // The hook exposes the Dataverse message inside the open dialog.
        }
    }

    const toggleItem = async (item: PricingItem) => {
        try {
            await setItemActive(item.gr_pricingitemid, item.statecode !== 0)
        } catch {
            // The hook exposes the Dataverse message in the page-level alert.
        }
    }

    const removeItem = async () => {
        if (!deletingItem) return
        try {
            await deleteItem(deletingItem.gr_pricingitemid)
            setDeletingItem(null)
        } catch {
            // The confirmation displays the Dataverse dependency or permission error.
        }
    }

    return (
        <div className="pricing-page">
            <header className="pricing-page-header">
                <div>
                    <span>Quotes</span>
                    <h1>Pricing catalogue</h1>
                </div>
                <button className="pricing-primary-button" type="button" onClick={() => setEditingItem(null)}>
                    + Add pricing item
                </button>
            </header>

            <section className="pricing-intro">
                <div>
                    <h2>Standard rates and reusable items</h2>
                    <p>These values are copied into new quote lines. Changing a rate will not alter an existing quote.</p>
                </div>
                <span>{items.filter((item) => item.statecode === 0).length} active items</span>
            </section>

            <div className="pricing-toolbar">
                <label className="pricing-search">
                    <span className="sr-only">Search pricing items</span>
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search name, code or description"
                    />
                </label>
                <label className="pricing-show-inactive">
                    <input
                        type="checkbox"
                        checked={showInactive}
                        onChange={(event) => setShowInactive(event.target.checked)}
                    />
                    Show inactive
                </label>
            </div>

            {saveError && editingItem === undefined && (
                <p className="pricing-page-error" role="alert">{saveError}</p>
            )}

            {isLoading ? (
                <section className="pricing-data-state" aria-live="polite">
                    <h2>Loading pricing catalogue</h2>
                    <p>Connecting to Dataverse.</p>
                </section>
            ) : loadError ? (
                <section className="pricing-data-state pricing-data-state-error" role="alert">
                    <div>
                        <h2>Pricing items could not be loaded</h2>
                        <p>{loadError}</p>
                    </div>
                    <button type="button" onClick={() => void reload()}>Try again</button>
                </section>
            ) : (
                <div className="pricing-table-shell">
                    <table className="pricing-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Category</th>
                                <th>Unit</th>
                                <th className="pricing-money">Price ex GST</th>
                                <th>GST</th>
                                <th>Status</th>
                                <th><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleItems.map((item) => (
                                <tr key={item.gr_pricingitemid} className={item.statecode === 0 ? '' : 'inactive'}>
                                    <td>
                                        <button className="pricing-item-link" type="button" onClick={() => setEditingItem(item)}>
                                            {item.gr_name}
                                        </button>
                                        <small>{item.gr_code || item.gr_description || 'No description'}</small>
                                    </td>
                                    <td>{PRICING_CATEGORY_LABELS[item.gr_category] ?? 'Other'}</td>
                                    <td>{item.gr_unitlabel}</td>
                                    <td className="pricing-money">{currencyFormatter.format(item.gr_unitprice)}</td>
                                    <td>{item.gr_taxable ? '15%' : 'No GST'}</td>
                                    <td>
                                        <span className={item.statecode === 0 ? 'pricing-status active' : 'pricing-status'}>
                                            {item.statecode === 0 ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="pricing-row-actions">
                                        <button type="button" onClick={() => setEditingItem(item)}>Edit</button>
                                        <button
                                            type="button"
                                            disabled={isSaving}
                                            onClick={() => void toggleItem(item)}
                                        >
                                            {item.statecode === 0 ? 'Deactivate' : 'Activate'}
                                        </button>
                                        <button
                                            type="button"
                                            className="pricing-delete-action"
                                            disabled={isSaving}
                                            onClick={() => { clearSaveError(); setDeletingItem(item) }}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {visibleItems.length === 0 && (
                        <div className="pricing-empty">
                            <h2>{items.length === 0 ? 'No pricing items yet' : 'No matching pricing items'}</h2>
                            <p>{items.length === 0
                                ? 'Add standard labour, travel, consumables, services or common parts.'
                                : 'Try changing the search or showing inactive items.'}</p>
                        </div>
                    )}
                </div>
            )}

            {editingItem !== undefined && (
                <PricingItemDialog
                    item={editingItem}
                    isSaving={isSaving}
                    error={saveError}
                    onClose={closeDialog}
                    onSave={saveItem}
                />
            )}
            {deletingItem && <EditDrawerConfirmation
                eyebrow="Pricing catalogue"
                title={`Delete ${deletingItem.gr_name}?`}
                message="This permanently removes the catalogue item. Existing Quote lines keep their copied description and price, but Dataverse may prevent deletion when a relationship still depends on this item."
                error={saveError}
                isBusy={isSaving}
                confirmLabel={isSaving ? 'Deleting…' : 'Delete item'}
                onCancel={() => { clearSaveError(); setDeletingItem(null) }}
                onConfirm={() => void removeItem()}
            />}
        </div>
    )
}
