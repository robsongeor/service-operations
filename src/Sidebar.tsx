import { NavLink } from 'react-router-dom'
import './Sidebar.css'

const menuItems = [
    { label: 'Overview', path: '/' },
    { label: 'Mechanics', path: '/mechanics' },
    { label: 'Jobs', path: '/jobs' },
]

export default function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo" />
                <span>◐</span>
            </div>

            <p className="sidebar-section-title">Main menu</p>

            <nav className="sidebar-nav">
                {menuItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            isActive ? 'sidebar-link active' : 'sidebar-link'
                        }
                    >
                        <span>○</span>
                        {item.label}
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-spacer" />

            <NavLink to="/settings" className="sidebar-link">
                <span>⚙</span>
                Settings
            </NavLink>
        </aside>
    )
}