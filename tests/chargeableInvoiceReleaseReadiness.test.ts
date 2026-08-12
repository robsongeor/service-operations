import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

async function source(path: string) {
    return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('release documentation owns retention, smoke, accessibility and rollback gates', async () => {
    const [operations, index, plan] = await Promise.all([
        source('docs/chargeable-invoice-review-operations.md'),
        source('docs/README.md'),
        source('docs/features/CHARGEABLE_INVOICE_REVIEW_IMPLEMENTATION_PLAN.md'),
    ])

    assert.match(index, /chargeable-invoice-review-operations\.md/)
    assert.match(plan, /local release-readiness baseline is complete/i)
    assert.match(operations, /V1 performs no automatic cleanup/)
    assert.match(operations, /user without the manager role/i)
    assert.match(operations, /keyboard only/i)
    assert.match(operations, /screen reader/i)
    assert.match(operations, /200% zoom/i)
    assert.match(operations, /Performance and request budgets/)
    assert.match(operations, /Do not create real accounting mutations or send communications/i)
    assert.match(operations, /Set the Chargeable Invoice import and approval flags false first/i)
})

test('independent import and approval flags remain server-only and fail closed', async () => {
    const [settings, preview, approval, viteConfig] = await Promise.all([
        source('api/local.settings.json.example'),
        source('api/services/chargeableInvoicePreviewService.js'),
        source('api/services/chargeableInvoiceApprovalService.js'),
        source('vite.config.ts'),
    ])
    const parsed = JSON.parse(settings) as { Values: Record<string, string> }

    assert.equal(parsed.Values.CHARGEABLE_INVOICE_PREVIEW_ENABLED, 'false')
    assert.equal(parsed.Values.CHARGEABLE_INVOICE_APPROVAL_ENABLED, 'false')
    assert.equal(parsed.Values.CHARGEABLE_INVOICE_MALWARE_SCANNING_READY, undefined)
    assert.match(preview, /process\.env\.CHARGEABLE_INVOICE_PREVIEW_ENABLED === 'true'/)
    assert.match(approval, /process\.env\.CHARGEABLE_INVOICE_APPROVAL_ENABLED === 'true'/)
    assert.doesNotMatch(`${preview}\n${approval}\n${viteConfig}`, /MALWARE_SCANNING_READY/)
    assert.ok(viteConfig.indexOf("require('./api/services/chargeableInvoiceApprovalService')")
        > viteConfig.indexOf('const installMiddleware'), 'Vite must load API-only PDF dependencies lazily')
})

test('manager workflow preserves silent authentication and excludes automatic email dispatch', async () => {
    const files = await Promise.all([
        source('src/alpha/chargeable-invoices/hooks/useChargeableInvoiceIntake.ts'),
        source('src/alpha/chargeable-invoices/hooks/useChargeableInvoiceReviews.ts'),
        source('src/alpha/chargeable-invoices/services/chargeableInvoicePreviewApi.ts'),
        source('src/alpha/chargeable-invoices/services/chargeableInvoiceReviewApi.ts'),
        source('src/alpha/chargeable-invoices/components/ChargeableInvoiceWorkspace.tsx'),
    ])
    const feature = files.join('\n')

    assert.doesNotMatch(feature, /loginPopup|loginRedirect/)
    assert.doesNotMatch(feature, /gr_emaildispatchs/)
    assert.match(feature, /acquireDataverseAccessToken/)
    assert.match(feature, /mailto:/)
})

test('intake, reads, rendering and files retain their bounded contracts', async () => {
    const [intake, client, preview, approval, apiPackage] = await Promise.all([
        source('src/alpha/chargeable-invoices/hooks/useChargeableInvoiceIntake.ts'),
        source('src/alpha/chargeable-invoices/services/chargeableInvoiceReviewApi.ts'),
        source('api/services/chargeableInvoicePreviewService.js'),
        source('api/services/chargeableInvoiceApprovalService.js'),
        source('api/package.json'),
    ])

    assert.match(intake, /MAX_BATCH_FILES = 20/)
    assert.match(intake, /PREVIEW_WORKERS = 2/)
    assert.match(client, /MAX_QUEUE_RECORDS = 500/)
    assert.match(client, /MAX_DETAIL_RECORDS = 500/)
    assert.match(client, /MAX_TECHNICIANS = 200/)
    assert.match(client, /MAX_SITE_CONTACTS = 200/)
    assert.match(preview, /MAX_PDF_BYTES = 5 \* 1024 \* 1024/)
    assert.match(preview, /MAX_PDF_PAGES = 5/)
    assert.match(approval, /MAX_LINES = 200/)
    assert.match(approval, /MAX_PDF_BYTES = 5 \* 1024 \* 1024/)
    assert.equal((JSON.parse(apiPackage) as { dependencies: Record<string, string> }).dependencies['pdfjs-dist'], '5.4.624')
})

test('workspace keeps the shared accessible drawer, tabs, selector and focus return', async () => {
    const [workspace, queue] = await Promise.all([
        source('src/alpha/chargeable-invoices/components/ChargeableInvoiceWorkspace.tsx'),
        source('src/alpha/chargeable-invoices/components/ChargeableInvoiceQueue.tsx'),
    ])

    assert.match(workspace, /EditDrawerShell/)
    assert.match(workspace, /DrawerTabs/)
    assert.match(workspace, /SearchableSelect/)
    assert.match(workspace, /aria-live="polite"/)
    assert.match(workspace, /Permanently delete/)
    assert.match(workspace, /deleteConfirmation\.trim\(\) !== review\.gr_invoicenumber/)
    assert.match(queue, /triggerRef\.current\?\.focus\(\)/)
})

test('manager role remains unassigned and deletion grants retain a separate provisioning gate', async () => {
    const schema = await source('docs/chargeable-invoice-review-dataverse-schema.md')

    assert.match(schema, /unassigned `Chargeable Invoice Manager` role/)
    assert.match(schema, /six grants remain\s*unprovisioned until separately approved/i)
    assert.match(schema, /no\s*Assign or Share/)
    assert.match(schema, /atomic whole-package workflow/)
    assert.match(schema, /V1 has no automatic retention cleanup/)
})
