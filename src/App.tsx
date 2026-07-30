import { useMsal } from '@azure/msal-react'
import LoginScreen from './alpha/LoginScreen'
import { Navigate, Routes, Route, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import JobsScreen from './alpha/jobs/JobsScreen'
import SchedulingScreen from './alpha/scheduling/SchedulingScreen'
import PricingScreen from './alpha/quotes/PricingScreen'
import QuotesScreen from './alpha/quotes/QuotesScreen'
import MechanicsScreen from './alpha/mechanics/MechanicsScreen'
import EquipmentScreen from './alpha/equipment/EquipmentScreen'
import CustomerDashboardScreen from './alpha/customers/CustomerDashboardScreen'
import WofScreen from './alpha/wof/WofScreen'
import { getSignedInUserInfo } from './auth/signedInUser'
import { useActiveMsalAccount } from './auth/useActiveMsalAccount'
import TechnicianJobSubmissionPage from './alpha/portal/TechnicianJobSubmissionPage'
import SiteChecksScreen from './alpha/site-checks/SiteChecksScreen'
import SiteCheckAssignmentPage from './alpha/portal/SiteCheckAssignmentPage'
import ChecklistAdminScreen from './alpha/site-checks/ChecklistAdminScreen'
import { isServiceOperationsAdministrator } from './auth/adminAuthorization'
import DataverseSessionRecovery from './auth/DataverseSessionRecovery'

function App() {
  const { accounts } = useMsal()
  const location = useLocation()
  const activeAccount = useActiveMsalAccount()
  const signedInUser = getSignedInUserInfo(activeAccount)

  if (location.pathname === '/portal/job' || location.pathname.startsWith('/portal/job/')) {
    return <Routes>
      <Route path="/portal/job/:token" element={<TechnicianJobSubmissionPage />} />
      <Route path="/portal/job" element={<TechnicianJobSubmissionPage />} />
    </Routes>
  }

  if (location.pathname === '/portal/site-check' || location.pathname.startsWith('/portal/site-check/')) {
    return <Routes>
      <Route path="/portal/site-check/:token" element={<SiteCheckAssignmentPage />} />
      <Route path="/portal/site-check" element={<SiteCheckAssignmentPage />} />
    </Routes>
  }

  if (accounts.length === 0) {
    return <LoginScreen />
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <DataverseSessionRecovery />
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div style={{ flex: 1, minWidth: 0, padding: '24px' }}>
        <Routes>
          <Route path="/" element={<div>Overview</div>} />
          <Route path="/customers" element={<CustomerDashboardScreen />} />
          <Route path="/mechanics" element={<MechanicsScreen />} />
          <Route path="/equipment" element={<EquipmentScreen />} />
          <Route path="/jobs" element={<JobsScreen key={signedInUser?.storageId || 'account-pending'} />} />
          <Route path="/site-checks" element={<SiteChecksScreen />} />
          <Route
            path="/site-checks/checklists"
            element={isServiceOperationsAdministrator(signedInUser)
              ? <ChecklistAdminScreen />
              : <Navigate to="/site-checks" replace />}
          />
          <Route path="/scheduling" element={<SchedulingScreen />} />
          <Route path="/quotes" element={<QuotesScreen key={signedInUser?.storageId || 'account-pending'} />} />
          <Route path="/pricing" element={<PricingScreen />} />
          <Route path="/wof" element={<WofScreen key={signedInUser?.storageId || 'account-pending'} accountId={signedInUser?.storageId || 'account-pending'} />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
