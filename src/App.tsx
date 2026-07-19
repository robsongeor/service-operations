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

function App() {
  const { accounts } = useMsal()

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
          <Route path="/mechanics" element={<MechanicsScreen />} />
          <Route path="/equipment" element={<EquipmentScreen />} />
          <Route path="/jobs" element={<JobsScreen />} />
          <Route path="/scheduling" element={<SchedulingScreen />} />
          <Route path="/quotes" element={<QuotesScreen />} />
          <Route path="/pricing" element={<PricingScreen />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
