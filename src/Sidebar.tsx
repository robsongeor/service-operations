import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import SidebarFooter from './SidebarFooter'
import SidebarBrand from './SidebarBrand'
import { getSignedInUserInfo } from './auth/signedInUser'
import { useActiveMsalAccount } from './auth/useActiveMsalAccount'
import { isServiceOperationsAdministrator } from './auth/adminAuthorization'
import { SERVICE_COORDINATOR_NAVIGATION_PATHS, type ApplicationAccess } from './auth/applicationAccess'
import './Sidebar.css'

const menuItems = [
    { label: 'Overview', shortLabel: 'O', path: '/' },
    { label: 'Customers', shortLabel: 'C', path: '/customers' },
    { label: 'Staff', shortLabel: 'S', path: '/staff' },
    { label: 'Equipment', shortLabel: 'E', path: '/equipment' },
    { label: 'Maintenance Booking', shortLabel: 'MB', path: '/maintenance-booking' },
    { label: 'Greentree Review', shortLabel: 'GT', path: '/equipment/greentree-test' },
    { label: 'Equipment Map', shortLabel: 'M', path: '/equipment-map' },
    { label: 'WOF / REGO', shortLabel: 'W', path: '/wof' },
    { label: 'Service coordination', shortLabel: 'SC', path: '/jobs' },
    { label: 'Job Import', shortLabel: 'JI', path: '/job-import' },
    { label: 'Equipment Photos', shortLabel: 'P', path: '/equipment-photos' },
    { label: 'Job Card reviews', shortLabel: 'JR', path: '/job-card-reviews' },
    { label: 'Job Map', shortLabel: 'JM', path: '/job-map' },
    { label: 'Job Book', shortLabel: 'JB', path: '/job-book' },
    { label: 'Site Checks', shortLabel: 'S', path: '/site-checks' },
    { label: 'Scheduling', shortLabel: 'C', path: '/scheduling' },
    { label: 'Quotes', shortLabel: 'Q', path: '/quotes' },
    { label: 'Chargeable Invoices', shortLabel: 'I', path: '/chargeable-invoices' },
    { label: 'Pricing', shortLabel: '$', path: '/pricing' },
]

export default function Sidebar({ access }: { access: ApplicationAccess }) {
    const [isOpen, setIsOpen] = useState(() => globalThis.innerWidth > 760)
    const activeAccount = useActiveMsalAccount()
    const isAdmin = isServiceOperationsAdministrator(getSignedInUserInfo(activeAccount))
    const allowedMenuItems = access.mode === 'full'
        ? menuItems
        : access.mode === 'service-coordinator'
            ? menuItems.filter((item) => SERVICE_COORDINATOR_NAVIGATION_PATHS.includes(item.path as typeof SERVICE_COORDINATOR_NAVIGATION_PATHS[number]))
            : access.mode === 'job-card-admin'
            ? menuItems.filter((item) => ['/job-card-reviews', '/job-book', '/quotes', '/equipment', '/customers'].includes(item.path))
            : access.mode === 'job-book-admin'
                ? menuItems.filter((item) => ['/job-book', '/equipment', '/customers'].includes(item.path))
                : menuItems.filter((item) => item.path === '/job-book')
    const visibleMenuItems = isAdmin && access.mode === 'full'
        ? [
            ...allowedMenuItems,
            { label: 'Checklist Admin', shortLabel: 'A', path: '/site-checks/checklists' },
        ]
        : allowedMenuItems

    return (
        <aside className={isOpen ? 'sidebar open' : 'sidebar collapsed'}>
            <button
                type="button"
                className="sidebar-toggle"
                aria-label={isOpen ? 'Collapse main menu' : 'Expand main menu'}
                aria-expanded={isOpen}
                onClick={() => setIsOpen((current) => !current)}
            >
                {isOpen ? '‹' : '›'}
            </button>

            <SidebarBrand key={isOpen ? 'open' : 'collapsed'} />

            <p className="sidebar-section-title">Main menu</p>

            <nav className="sidebar-nav" aria-label="Main menu">
                {visibleMenuItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        title={isOpen ? undefined : item.label}
                        aria-label={item.label}
                        className={({ isActive }) =>
                            isActive ? 'sidebar-link active' : 'sidebar-link'
                        }
                        onClick={() => {
                            if (globalThis.innerWidth <= 760) setIsOpen(false)
                        }}
                    >
                        <span className="sidebar-link-icon" aria-hidden="true">{item.shortLabel}</span>
                        <span className="sidebar-link-label">{item.label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-spacer" />

            <SidebarFooter />
        </aside>
    )
}
