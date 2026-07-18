import { useMsal } from '@azure/msal-react'
import LoginScreen from './alpha/LoginScreen'
import TestScreen from './alpha/test-screen/TestScreen'
import { Routes, Route } from 'react-router-dom'
import Sidebar from './Sidebar'
import JobsScreen from './alpha/jobs/JobsScreen'

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
          <Route path="/mechanics" element={<TestScreen />} />
          <Route path="/jobs" element={<JobsScreen />} />
        </Routes>
      </div>
    </div>
  )
}

export default App
