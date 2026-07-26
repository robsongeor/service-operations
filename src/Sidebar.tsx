import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import SidebarFooter from './SidebarFooter'
import { getSignedInUserInfo } from './auth/signedInUser'
import { useActiveMsalAccount } from './auth/useActiveMsalAccount'
import { isServiceOperationsAdministrator } from './auth/adminAuthorization'
import './Sidebar.css'

const menuItems = [
    { label: 'Overview', shortLabel: 'O', path: '/' },
    { label: 'Customers', shortLabel: 'C', path: '/customers' },
    { label: 'Mechanics', shortLabel: 'M', path: '/mechanics' },
    { label: 'Equipment', shortLabel: 'E', path: '/equipment' },
    { label: 'WOF / REGO', shortLabel: 'W', path: '/wof' },
    { label: 'Jobs', shortLabel: 'J', path: '/jobs' },
    { label: 'Site Checks', shortLabel: 'S', path: '/site-checks' },
    { label: 'Scheduling', shortLabel: 'C', path: '/scheduling' },
    { label: 'Quotes', shortLabel: 'Q', path: '/quotes' },
    { label: 'Pricing', shortLabel: '$', path: '/pricing' },
]

export default function Sidebar() {
    const [isOpen, setIsOpen] = useState(true)
    const activeAccount = useActiveMsalAccount()
    const isAdmin = isServiceOperationsAdministrator(getSignedInUserInfo(activeAccount))
    const visibleMenuItems = isAdmin
        ? [
            ...menuItems,
            { label: 'Checklist Admin', shortLabel: 'A', path: '/site-checks/checklists' },
        ]
        : menuItems

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

            <div className="sidebar-header">
                <div className="sidebar-logo" aria-hidden="true">SO</div>
                <div className="sidebar-brand">
                    <strong>Service</strong>
                    <span>Operations</span>
                </div>
            </div>

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
