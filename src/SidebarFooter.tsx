import AppVersion from './AppVersion'
import SidebarUserInfo from './SidebarUserInfo'
import OperationalDataDiagnostics from './alpha/shared/data/OperationalDataDiagnostics'

export default function SidebarFooter() {
    return <footer className="sidebar-footer">{import.meta.env.DEV && <OperationalDataDiagnostics />}<SidebarUserInfo /><AppVersion /></footer>
}
