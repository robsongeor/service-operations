import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Overview is an operational launch dashboard using shared page structure and real routes', () => {
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
    const screen = readFileSync(new URL('../src/alpha/overview/OverviewScreen.tsx', import.meta.url), 'utf8')
    const styles = readFileSync(new URL('../src/alpha/overview/OverviewScreen.css', import.meta.url), 'utf8')

    assert.match(app, /lazy\(\(\) => import\('\.\/alpha\/overview\/OverviewScreen'\)\)/)
    assert.match(app, /path="\/" element=\{<OverviewScreen \/>\}/)
    assert.match(screen, /<PageHeader/)
    assert.match(screen, /Customer[\s\S]*Site[\s\S]*Equipment[\s\S]*Job/)
    for (const path of ['/jobs', '/site-checks', '/chargeable-invoices', '/quotes', '/customers', '/equipment', '/equipment-map', '/wof', '/staff', '/pricing']) {
        assert.match(screen, new RegExp(`path: '${path.replace('/', '\\/')}'|to="${path.replace('/', '\\/')}"`))
    }
    assert.doesNotMatch(screen, /Math\.random|placeholder metric|fake/i)
    assert.match(styles, /prefers-reduced-motion/)
    assert.match(styles, /focus-visible/)
})
