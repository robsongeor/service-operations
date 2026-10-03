import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from '../../src/App'
import '../../src/index.css'
import { UNIFIED_JOB_WALKTHROUGH } from '../../src/alpha/jobs/domain/unifiedJobWorkflow'

export default function Walkthrough() {
    return <>
        <div style={{ padding: '42px 20px 10px', background: '#fff2c5', color: '#433600', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 10 }}>
            <strong>LOCAL WALKTHROUGH · sample data only</strong>
            {UNIFIED_JOB_WALKTHROUGH && <label>Sample role <select aria-label="Sample role" defaultValue={sessionStorage.getItem('job-card-walkthrough-role') || 'admin'} onChange={(event) => { sessionStorage.setItem('job-card-walkthrough-role', event.target.value); location.href = '/job-book' }}><option value="admin">Admin</option><option value="coordinator">Service coordinator</option></select></label>}
            {(!UNIFIED_JOB_WALKTHROUGH || sessionStorage.getItem('job-card-walkthrough-role') !== 'coordinator') && <label>Sample administrator{' '}<select aria-label="Sample administrator" defaultValue={sessionStorage.getItem('job-card-walkthrough-actor') || 'nargiza'} onChange={(event) => { sessionStorage.setItem('job-card-walkthrough-actor', event.target.value); location.reload() }}>
                <option value="nargiza">Nargiza (sample)</option><option value="jess">Jess (sample)</option>
            </select></label>}
            <span>No Microsoft sign-in, live data or email delivery.</span>
            <button type="button" onClick={async () => { await fetch('/__walkthrough/reset', { method: 'POST' }); location.href = '/job-card-reviews' }}>Reset sample cards</button>
        </div>
        <BrowserRouter><App /></BrowserRouter>
    </>
}

const rootElement = document.getElementById('root')!
const walkthroughRoot = import.meta.hot?.data.root ?? createRoot(rootElement, { onUncaughtError: (error) => { rootElement.textContent = `Local walkthrough error: ${error instanceof Error ? error.stack : String(error)}` } })
if (import.meta.hot) import.meta.hot.data.root = walkthroughRoot
walkthroughRoot.render(<Walkthrough />)
