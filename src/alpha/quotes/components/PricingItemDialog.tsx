import { useState, type FormEvent } from 'react'
import {
    PRICING_CATEGORIES,
    PRICING_CATEGORY_LABELS,
    type PricingCategory,
    type PricingItem,
    type PricingItemInput,
} from '../types/pricing.types'

type PricingItemDialogProps = {
    item: PricingItem | null
    isSaving: boolean
    error: string
    onClose: () => void
    onSave: (item: PricingItemInput) => Promise<void>
}

const emptyItem: PricingItemInput = {
    name: '',
    code: '',
    category: PRICING_CATEGORIES.LABOUR,
    description: '',
    unitLabel: 'each',
    unitPrice: 0,
    taxable: true,
    sortOrder: null,
}

export default function PricingItemDialog({
    item,
    isSaving,
    error,
    onClose,
    onSave,
}: PricingItemDialogProps) {
    const [form, setForm] = useState<PricingItemInput>(() => item ? {
            name: item.gr_name,
            code: item.gr_code ?? '',
            category: item.gr_category,
            description: item.gr_description ?? '',
            unitLabel: item.gr_unitlabel,
            unitPrice: item.gr_unitprice,
            taxable: item.gr_taxable,
            sortOrder: item.gr_sortorder,
        } : emptyItem)

    const submit = async (event: FormEvent) => {
        event.preventDefault()
        await onSave(form)
    }

    return (
        <div className="pricing-dialog-backdrop" role="presentation" onMouseDown={onClose}>
            <section
                className="pricing-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pricing-dialog-title"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header>
                    <div>
                        <span>Pricing catalogue</span>
                        <h2 id="pricing-dialog-title">{item ? 'Edit pricing item' : 'New pricing item'}</h2>
                    </div>
                    <button type="button" aria-label="Close" onClick={onClose}>×</button>
                </header>

                <form onSubmit={(event) => void submit(event)}>
                    <div className="pricing-form-grid">
                        <label className="pricing-field pricing-field-wide">
                            <span>Name *</span>
                            <input
                                required
                                autoFocus
                                value={form.name}
                                onChange={(event) => setForm({ ...form, name: event.target.value })}
                                placeholder="Standard labour"
                            />
                        </label>

                        <label className="pricing-field">
                            <span>Code</span>
                            <input
                                value={form.code}
                                onChange={(event) => setForm({ ...form, code: event.target.value })}
                                placeholder="LABOUR"
                            />
                        </label>

                        <label className="pricing-field">
                            <span>Category *</span>
                            <select
                                required
                                value={form.category}
                                onChange={(event) => setForm({
                                    ...form,
                                    category: Number(event.target.value) as PricingCategory,
                                })}
                            >
                                {Object.entries(PRICING_CATEGORY_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="pricing-field pricing-field-wide">
                            <span>Description</span>
                            <textarea
                                rows={3}
                                value={form.description}
                                onChange={(event) => setForm({ ...form, description: event.target.value })}
                                placeholder="Default description copied onto the quote line"
                            />
                        </label>

                        <label className="pricing-field">
                            <span>Unit label *</span>
                            <input
                                required
                                value={form.unitLabel}
                                onChange={(event) => setForm({ ...form, unitLabel: event.target.value })}
                                placeholder="hour, each, km or job"
                            />
                        </label>

                        <label className="pricing-field">
                            <span>Unit price (ex GST) *</span>
                            <input
                                required
                                type="number"
                                min="0"
                                step="0.01"
                                value={form.unitPrice}
                                onChange={(event) => setForm({ ...form, unitPrice: Number(event.target.value) })}
                            />
                        </label>

                        <label className="pricing-field">
                            <span>Sort order</span>
                            <input
                                type="number"
                                step="1"
                                value={form.sortOrder ?? ''}
                                onChange={(event) => setForm({
                                    ...form,
                                    sortOrder: event.target.value === '' ? null : Number(event.target.value),
                                })}
                                placeholder="Optional"
                            />
                        </label>

                        <label className="pricing-checkbox">
                            <input
                                type="checkbox"
                                checked={form.taxable}
                                onChange={(event) => setForm({ ...form, taxable: event.target.checked })}
                            />
                            <span>Charge GST on this item</span>
                        </label>
                    </div>

                    {error && <p className="pricing-form-error" role="alert">{error}</p>}

                    <footer>
                        <button type="button" className="pricing-secondary-button" onClick={onClose}>Cancel</button>
                        <button type="submit" className="pricing-primary-button" disabled={isSaving}>
                            {isSaving ? 'Saving…' : item ? 'Save changes' : 'Create item'}
                        </button>
                    </footer>
                </form>
            </section>
        </div>
    )
}
