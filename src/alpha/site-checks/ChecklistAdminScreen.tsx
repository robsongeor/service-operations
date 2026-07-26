import { useMemo, useState } from 'react'
import PageHeader from '../shared/page-header/PageHeader.tsx'
import FormSwitch from '../shared/form-switch/FormSwitch.tsx'
import { newChecklistDraftItem, validateChecklistDraft } from './domain/siteCheckChecklistAdmin.ts'
import { useChecklistAdmin, type ChecklistAdminDefinition } from './hooks/useChecklistAdmin.ts'
import { SITE_CHECK_CHECKLIST_RESPONSE_TYPES } from './types/siteCheckChecklist.types.ts'
import './ChecklistAdminScreen.css'

const RESPONSE_OPTIONS = [
    { value: SITE_CHECK_CHECKLIST_RESPONSE_TYPES.PASS_FAIL_NOT_APPLICABLE, label: 'Pass / Fail / N/A' },
    { value: SITE_CHECK_CHECKLIST_RESPONSE_TYPES.YES_NO, label: 'Yes / No' },
    { value: SITE_CHECK_CHECKLIST_RESPONSE_TYPES.NUMBER, label: 'Number' },
    { value: SITE_CHECK_CHECKLIST_RESPONSE_TYPES.TEXT, label: 'Text' },
]

function label(code: string) {
    return code === 'SITE_CHECK_ELECTRIC' ? 'Electric checklist' : 'ICE checklist'
}

export default function ChecklistAdminScreen() {
    const admin = useChecklistAdmin()
    const [selectedCode, setSelectedCode] = useState('SITE_CHECK_ICE')
    const [confirming, setConfirming] = useState(false)
    const definition = admin.definitions.find((item) => item.template.gr_templatecode === selectedCode)
    const errors = useMemo(
        () => definition ? validateChecklistDraft(definition.draftItems) : [],
        [definition],
    )
    const busy = Boolean(admin.publishingCode)

    const change = (
        current: ChecklistAdminDefinition,
        index: number,
        patch: Partial<ChecklistAdminDefinition['draftItems'][number]>,
    ) => admin.updateDraft(current.template.gr_templatecode, current.draftItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item))
    const move = (current: ChecklistAdminDefinition, index: number, offset: number) => {
        const target = index + offset
        if (target < 0 || target >= current.draftItems.length) return
        const next = [...current.draftItems]
        ;[next[index], next[target]] = [next[target], next[index]]
        admin.updateDraft(current.template.gr_templatecode, next)
    }

    return <main className="checklist-admin-screen">
        <PageHeader
            eyebrow="Site Check administration"
            title="Checklist Admin"
            subtitle="Publish new ICE and Electric checklist versions without changing historical Site Checks."
            actions={<button type="button" onClick={() => void admin.refresh()} disabled={admin.loading || busy}>Reload</button>}
        />
        <div className="checklist-admin-warning">
            <strong>Published questions are historical records.</strong>
            <span>Changes create a new version used only by future Site Checks.</span>
        </div>
        <nav className="checklist-admin-tabs" aria-label="Checklist type">
            {['SITE_CHECK_ICE', 'SITE_CHECK_ELECTRIC'].map((code) => <button
                type="button"
                key={code}
                className={selectedCode === code ? 'active' : ''}
                aria-current={selectedCode === code ? 'page' : undefined}
                onClick={() => { setSelectedCode(code); setConfirming(false) }}
            >{label(code)}</button>)}
        </nav>
        {admin.loading && <div className="checklist-admin-state" role="status">Loading checklist definitions…</div>}
        {admin.error && <div className="checklist-admin-state error" role="alert">{admin.error}</div>}
        {!admin.loading && definition && <section className="checklist-admin-editor">
            <header>
                <div>
                    <h2>{label(definition.template.gr_templatecode)}</h2>
                    <p>Published version {definition.template.gr_version} · {definition.draftItems.length} questions</p>
                </div>
                <button
                    type="button"
                    onClick={() => admin.updateDraft(
                        definition.template.gr_templatecode,
                        [...definition.draftItems, newChecklistDraftItem()],
                    )}
                    disabled={busy}
                >+ Add question</button>
            </header>
            <ol className="checklist-admin-items">
                {definition.draftItems.map((item, index) => <li key={item.clientId}>
                    <div className="checklist-admin-item-heading">
                        <strong>{index + 1}</strong>
                        <div>
                            <button type="button" onClick={() => move(definition, index, -1)} disabled={busy || index === 0} aria-label={`Move question ${index + 1} up`}>↑</button>
                            <button type="button" onClick={() => move(definition, index, 1)} disabled={busy || index === definition.draftItems.length - 1} aria-label={`Move question ${index + 1} down`}>↓</button>
                            <button
                                type="button"
                                className="danger"
                                disabled={busy}
                                onClick={() => admin.updateDraft(
                                    definition.template.gr_templatecode,
                                    definition.draftItems.filter((_, itemIndex) => itemIndex !== index),
                                )}
                            >Remove</button>
                        </div>
                    </div>
                    <div className="checklist-admin-fields">
                        <label className="wide">Question
                            <textarea rows={2} value={item.prompt} onChange={(event) => change(definition, index, { prompt: event.target.value })} />
                        </label>
                        <label>Section
                            <input value={item.groupName} onChange={(event) => change(definition, index, { groupName: event.target.value })} />
                        </label>
                        <label>Stable item key
                            <input value={item.itemKey} onChange={(event) => change(definition, index, { itemKey: event.target.value })} />
                        </label>
                        <label>Answer type
                            <select value={item.responseType} onChange={(event) => change(definition, index, {
                                responseType: Number(event.target.value) as typeof item.responseType,
                                commentRequiredOnNegative: [122830000, 122830001].includes(Number(event.target.value))
                                    ? item.commentRequiredOnNegative
                                    : false,
                            })}>
                                {RESPONSE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                            </select>
                        </label>
                        <div className="checklist-admin-rules">
                            <span>Answer required</span>
                            <FormSwitch label="Answer required" checked={item.required} disabled={busy} onChange={(required) => change(definition, index, { required })} />
                        </div>
                        {[122830000, 122830001].includes(item.responseType) && <div className="checklist-admin-rules">
                            <span>Comment required on failure</span>
                            <FormSwitch label="Comment required on failure" checked={item.commentRequiredOnNegative} disabled={busy} onChange={(commentRequiredOnNegative) => change(definition, index, { commentRequiredOnNegative })} />
                        </div>}
                        <div className="checklist-admin-rules">
                            <span>Photo required on failure</span>
                            <FormSwitch label="Photo required on failure" checked={item.photoRequiredOnNegative} disabled={busy} onChange={(photoRequiredOnNegative) => change(definition, index, { photoRequiredOnNegative })} />
                        </div>
                    </div>
                </li>)}
            </ol>
            {errors.length > 0 && <div className="checklist-admin-validation" role="alert">
                <strong>Fix before publishing</strong>
                <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </div>}
            <footer>
                {!confirming
                    ? <button type="button" disabled={busy || errors.length > 0} onClick={() => setConfirming(true)}>
                        Review publication
                    </button>
                    : <div className="checklist-admin-confirm">
                        <p>Publish version {definition.template.gr_version + 1}? Future Site Checks will use these {definition.draftItems.length} questions. Existing Site Checks will not change.</p>
                        <button type="button" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
                        <button type="button" className="primary" disabled={busy} onClick={() => void admin.publish(definition).then((published) => {
                            if (published) setConfirming(false)
                        })}>
                            {busy ? 'Publishing…' : `Publish version ${definition.template.gr_version + 1}`}
                        </button>
                    </div>}
            </footer>
        </section>}
    </main>
}
