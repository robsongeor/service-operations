import { useMsal } from '@azure/msal-react'
import LoginScreen from './alpha/LoginScreen'
import { Routes, Route } from 'react-router-dom'
import Sidebar from './Sidebar'
import JobsScreen from './alpha/jobs/JobsScreen'
import SchedulingScreen from './alpha/scheduling/SchedulingScreen'
import PricingScreen from './alpha/quotes/PricingScreen'
import QuotesScreen from './alpha/quotes/QuotesScreen'
import MechanicsScreen from './alpha/mechanics/MechanicsScreen'
import EquipmentScreen from './alpha/equipment/EquipmentScreen'
import CustomerDashboardScreen from './alpha/customers/CustomerDashboardScreen'
import JobApiTestScreen from './alpha/job-api-test/JobApiTestScreen'
import WofScreen from './alpha/wof/WofScreen'
import { getSignedInUserInfo } from './auth/signedInUser'
import { useActiveMsalAccount } from './auth/useActiveMsalAccount'

function App() {
  const { accounts } = useMsal()
  const activeAccount = useActiveMsalAccount()
  const signedInUser = getSignedInUserInfo(activeAccount)

  if (accounts.length === 0) {
    return <LoginScreen />
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
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
          <Route path="/scheduling" element={<SchedulingScreen />} />
          <Route path="/quotes" element={<QuotesScreen key={signedInUser?.storageId || 'account-pending'} />} />
          <Route path="/pricing" element={<PricingScreen />} />
          <Route path="/job-api-test" element={<JobApiTestScreen />} />
          <Route path="/wof" element={<WofScreen key={signedInUser?.storageId || 'account-pending'} accountId={signedInUser?.storageId || 'account-pending'} />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
