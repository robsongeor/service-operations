import { Link } from 'react-router-dom'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { getSignedInUserInfo } from '../../auth/signedInUser'
import PageHeader from '../shared/page-header/PageHeader'
import './OverviewScreen.css'

type WorkspaceLink = {
    title: string
    eyebrow: string
    description: string
    path: string
    action: string
    icon: string
    tone: 'teal' | 'blue' | 'amber' | 'plum'
}

const operationalWorkspaces: WorkspaceLink[] = [
    { title: 'Jobs', eyebrow: 'Daily operations', description: 'Allocate work, follow progress, and complete the operational record.', path: '/jobs', action: 'Open Jobs', icon: 'J', tone: 'teal' },
    { title: 'Site Checks', eyebrow: 'Recurring inspections', description: 'Review every enabled Site and start work that is due or overdue.', path: '/site-checks', action: 'Open Site Checks', icon: 'S', tone: 'blue' },
    { title: 'Chargeable Invoices', eyebrow: 'Manager workflow', description: 'Review GreenTree invoices and prepare completed work for Accounts.', path: '/chargeable-invoices', action: 'Review invoices', icon: 'I', tone: 'amber' },
    { title: 'Quotes', eyebrow: 'Customer estimates', description: 'Prepare, send, and follow up quotes linked to customers and jobs.', path: '/quotes', action: 'Open Quotes', icon: 'Q', tone: 'plum' },
]

const networkLinks = [
    { title: 'Customers', detail: 'Sites, contacts and service settings', path: '/customers', icon: 'C' },
    { title: 'Equipment', detail: 'Fleet records and maintenance', path: '/equipment', icon: 'E' },
    { title: 'Equipment Map', detail: 'Assigned Site locations', path: '/equipment-map', icon: 'M' },
    { title: 'WOF / REGO', detail: 'Road-compliance work', path: '/wof', icon: 'W' },
    { title: 'Staff', detail: 'Technicians and contact details', path: '/staff', icon: 'S' },
    { title: 'Pricing', detail: 'Reusable quote items and rates', path: '/pricing', icon: '$' },
]

function newZealandGreeting() {
    const hour = Number(new Intl.DateTimeFormat('en-NZ', {
        timeZone: 'Pacific/Auckland',
        hour: '2-digit',
        hourCycle: 'h23',
    }).format(new Date()))
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
}

function newZealandDate() {
    return new Intl.DateTimeFormat('en-NZ', {
        timeZone: 'Pacific/Auckland',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(new Date())
}

export default function OverviewScreen() {
    const account = useActiveMsalAccount()
    const user = getSignedInUserInfo(account)
    const firstName = user?.displayName?.trim().split(/\s+/)[0]

    return <main className="overview-screen">
        <PageHeader
            eyebrow="Service operations"
            title="Overview"
            subtitle="Your starting point for workshop, field service, inspections, and customer work."
            actions={<Link className="overview-header-action" to="/jobs">Open Jobs</Link>}
        />

        <section className="overview-welcome">
            <div className="overview-welcome-copy">
                <span>{newZealandDate()}</span>
                <h2>{newZealandGreeting()}{firstName ? `, ${firstName}` : ''}.</h2>
                <p>Start with the active work queues, then move into the customer and equipment records when more context is needed.</p>
                <div className="overview-quick-actions" aria-label="Common workspaces">
                    <Link to="/jobs">View operational Jobs</Link>
                    <Link to="/scheduling">Open Scheduling</Link>
                    <Link to="/site-checks">Review Site Checks</Link>
                </div>
            </div>
            <div className="overview-service-path" aria-label="Service operations record path">
                <span>How the operation connects</span>
                <ol>
                    <li><small>01</small><strong>Customer</strong></li>
                    <li><small>02</small><strong>Site</strong></li>
                    <li><small>03</small><strong>Equipment</strong></li>
                    <li><small>04</small><strong>Job</strong></li>
                </ol>
            </div>
        </section>

        <section className="overview-section" aria-labelledby="overview-workspaces-title">
            <div className="overview-section-heading">
                <div><span>Work queues</span><h2 id="overview-workspaces-title">Keep today’s work moving</h2></div>
                <p>Open a workspace to see its current totals, filters, and actions.</p>
            </div>
            <div className="overview-workspace-grid">
                {operationalWorkspaces.map((workspace) => <Link className={`overview-workspace-card tone-${workspace.tone}`} to={workspace.path} key={workspace.path}>
                    <span className="overview-workspace-icon" aria-hidden="true">{workspace.icon}</span>
                    <div><small>{workspace.eyebrow}</small><h3>{workspace.title}</h3><p>{workspace.description}</p></div>
                    <strong>{workspace.action}<span aria-hidden="true">→</span></strong>
                </Link>)}
            </div>
        </section>

        <section className="overview-bottom-grid">
            <div className="overview-network" aria-labelledby="overview-network-title">
                <div className="overview-section-heading compact"><div><span>Service network</span><h2 id="overview-network-title">Find the operating context</h2></div></div>
                <div className="overview-network-grid">
                    {networkLinks.map((item) => <Link to={item.path} key={item.path}>
                        <span aria-hidden="true">{item.icon}</span>
                        <div><strong>{item.title}</strong><small>{item.detail}</small></div>
                        <b aria-hidden="true">›</b>
                    </Link>)}
                </div>
            </div>
            <aside className="overview-day-plan">
                <span>Suggested rhythm</span>
                <h2>A practical order for the day</h2>
                <ol>
                    <li><strong>Check Jobs and Scheduling</strong><small>Confirm allocation and anything waiting for attention.</small></li>
                    <li><strong>Review Site Checks</strong><small>Start due inspections and continue active work.</small></li>
                    <li><strong>Clear commercial follow-up</strong><small>Move chargeable invoices and quotes to their next step.</small></li>
                </ol>
            </aside>
        </section>
    </main>
}
