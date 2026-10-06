import { lazy, Suspense } from 'react'
import { useMsal } from '@azure/msal-react'
import LoginScreen from './alpha/LoginScreen'
import { Navigate, Routes, Route, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { getSignedInUserInfo } from './auth/signedInUser'
import { useActiveMsalAccount } from './auth/useActiveMsalAccount'
import { isServiceOperationsAdministrator } from './auth/adminAuthorization'
import AccessDeniedScreen from './auth/AccessDeniedScreen'
import { applicationAccessFromEnvironment } from './auth/applicationAccess'
import DataverseSessionRecovery from './auth/DataverseSessionRecovery'
import { OperationalDataClientProvider } from './alpha/shared/data/OperationalDataClientProvider'
import { OperationalScreenPerformanceProvider } from './alpha/shared/data/OperationalScreenPerformance'
import OperationalRealtimeProvider from './alpha/shared/realtime/OperationalRealtimeProvider'
import { QuoteEditorOverlayProvider } from './alpha/quotes/QuoteEditorOverlayProvider'

const JobsScreen = lazy(() => import('./alpha/jobs/JobsScreen'))
const JobCardReviewsScreen = lazy(() => import('./alpha/job-card-reviews/JobCardReviewsScreen'))
const SchedulingScreen = lazy(() => import('./alpha/scheduling/SchedulingScreen'))
const PricingScreen = lazy(() => import('./alpha/quotes/PricingScreen'))
const QuotesScreen = lazy(() => import('./alpha/quotes/QuotesScreen'))
const MechanicsScreen = lazy(() => import('./alpha/mechanics/MechanicsScreen'))
const EquipmentScreen = lazy(() => import('./alpha/equipment/EquipmentScreen'))
const CustomerDashboardScreen = lazy(() => import('./alpha/customers/CustomerDashboardScreen'))
const WofScreen = lazy(() => import('./alpha/wof/WofScreen'))
const TechnicianJobSubmissionPage = lazy(() => import('./alpha/portal/TechnicianJobSubmissionPage'))
const SiteChecksScreen = lazy(() => import('./alpha/site-checks/SiteChecksScreen'))
const SiteCheckAssignmentPage = lazy(() => import('./alpha/portal/SiteCheckAssignmentPage'))
const ChecklistAdminScreen = lazy(() => import('./alpha/site-checks/ChecklistAdminScreen'))
const ChargeableInvoiceReviewScreen = lazy(() => import('./alpha/chargeable-invoices/ChargeableInvoiceReviewScreen'))
const EquipmentMapScreen = lazy(() => import('./alpha/equipment-map/EquipmentMapScreen'))
const JobMapScreen = lazy(() => import('./alpha/job-map/JobMapScreen'))
const GreentreeEquipmentTestScreen = lazy(() => import('./alpha/equipment-test/GreentreeEquipmentTestScreen'))
const JobBookPrototypeScreen = lazy(() => import('./alpha/job-book/JobBookPrototypeScreen'))
const OverviewScreen = lazy(() => import('./alpha/overview/OverviewScreen'))
const EquipmentPhotoUploadScreen = lazy(() => import('./alpha/equipment-photos/EquipmentPhotoUploadScreen'))
const MaintenanceBookingScreen = lazy(() => import('./alpha/maintenance-booking/MaintenanceBookingScreen'))
const JobSpreadsheetImportScreen = lazy(() => import('./alpha/job-import/JobSpreadsheetImportScreen'))

function RouteLoadingFallback() {
  return <div role="status" aria-live="polite" style={{ padding: '24px', color: '#66736c', fontSize: '.8rem' }}>Loading page…</div>
}

function App() {
  const { accounts } = useMsal()
  const location = useLocation()
  const activeAccount = useActiveMsalAccount()
  const signedInUser = getSignedInUserInfo(activeAccount)
  const access = applicationAccessFromEnvironment(activeAccount)

  if (location.pathname === '/portal/job' || location.pathname.startsWith('/portal/job/')) {
    return <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path="/portal/job/:token" element={<TechnicianJobSubmissionPage />} />
        <Route path="/portal/job" element={<TechnicianJobSubmissionPage />} />
      </Routes>
    </Suspense>
  }

  if (location.pathname === '/portal/site-check' || location.pathname.startsWith('/portal/site-check/')) {
    return <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path="/portal/site-check/:token" element={<SiteCheckAssignmentPage />} />
        <Route path="/portal/site-check" element={<SiteCheckAssignmentPage />} />
      </Routes>
    </Suspense>
  }

  if (accounts.length === 0) {
    return <LoginScreen />
  }

  if (access.mode === 'denied') {
    return <AccessDeniedScreen access={access} user={signedInUser} />
  }

  const operationalDataScope = `${import.meta.env.VITE_DATAVERSE_URL ?? 'dataverse'}:${activeAccount?.tenantId ?? 'tenant'}:${signedInUser?.storageId ?? activeAccount?.homeAccountId ?? 'account'}`

  return (
    <OperationalDataClientProvider scope={operationalDataScope}>
    <OperationalScreenPerformanceProvider>
    <OperationalRealtimeProvider key={operationalDataScope}>
    <QuoteEditorOverlayProvider>
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <DataverseSessionRecovery />
      {/* Sidebar */}
      <Sidebar access={access} />

      {/* Main Content */}
      <div style={{ flex: 1, minWidth: 0, padding: '24px' }}>
        <Suspense fallback={<RouteLoadingFallback />}>
          {access.isSimulated && <div className="access-simulation-banner" role="status">
            Simulating {access.mode} access — this is a navigation test, not a security test.
          </div>}
          {access.mode === 'job-book-only' ? <Routes>
            <Route path="/" element={<Navigate to="/job-book" replace />} />
            <Route path="/job-book" element={<JobBookPrototypeScreen key={signedInUser?.storageId || 'account-pending'} allowManagedJobNavigation={false} allowManagedJobMarkerUpdates={false} />} />
            <Route path="*" element={<AccessDeniedScreen access={access} user={signedInUser} restrictedRoute />} />
          </Routes> : access.mode === 'job-book-admin' ? <Routes>
            <Route path="/" element={<Navigate to="/job-book" replace />} />
            <Route path="/job-book" element={<JobBookPrototypeScreen key={signedInUser?.storageId || 'account-pending'} allowManagedJobNavigation={false} allowManagedJobMarkerUpdates={false} />} />
            <Route path="/equipment" element={<EquipmentScreen readOnly />} />
            <Route path="/customers" element={<CustomerDashboardScreen readOnly />} />
            <Route path="*" element={<AccessDeniedScreen access={access} user={signedInUser} restrictedRoute />} />
          </Routes> : access.mode === 'job-card-admin' ? <Routes>
            <Route path="/" element={<Navigate to="/job-card-reviews" replace />} />
            <Route path="/job-card-reviews" element={<JobCardReviewsScreen key={`${signedInUser?.storageId}-queue`} />} />
            <Route path="/job-card-reviews/:reviewId" element={<JobCardReviewsScreen key={`${signedInUser?.storageId}-${location.pathname}`} />} />
            <Route path="/job-book" element={<JobBookPrototypeScreen key={signedInUser?.storageId || 'account-pending'} allowManagedJobNavigation={false} allowManagedJobMarkerUpdates={access.canUpdateEntryMarkers} />} />
            <Route path="/quotes" element={<QuotesScreen key={signedInUser?.storageId || 'account-pending'} readOnly />} />
            <Route path="/equipment" element={<EquipmentScreen readOnly />} />
            <Route path="/customers" element={<CustomerDashboardScreen readOnly />} />
            <Route path="*" element={<AccessDeniedScreen access={access} user={signedInUser} restrictedRoute />} />
          </Routes> : <Routes>
            <Route path="/" element={<OverviewScreen />} />
            <Route path="/customers" element={<CustomerDashboardScreen />} />
            <Route path="/staff" element={<MechanicsScreen />} />
            <Route path="/mechanics" element={<Navigate to="/staff" replace />} />
            <Route path="/equipment" element={<EquipmentScreen />} />
            <Route path="/maintenance-booking" element={<MaintenanceBookingScreen />} />
            <Route path="/equipment/greentree-test" element={<GreentreeEquipmentTestScreen />} />
            <Route path="/equipment-map" element={<EquipmentMapScreen key={signedInUser?.storageId || 'account-pending'} />} />
            <Route path="/job-map" element={<JobMapScreen key={signedInUser?.storageId || 'account-pending'} />} />
            <Route path="/jobs" element={<JobsScreen key={signedInUser?.storageId || 'account-pending'} />} />
            <Route path="/job-import" element={<JobSpreadsheetImportScreen key={signedInUser?.storageId || 'account-pending'} />} />
            <Route path="/equipment-photos" element={<EquipmentPhotoUploadScreen key={signedInUser?.storageId || 'account-pending'} />} />
            <Route path="/job-card-reviews" element={<JobCardReviewsScreen key={`${signedInUser?.storageId}-queue`} />} />
            <Route path="/job-card-reviews/:reviewId" element={<JobCardReviewsScreen key={`${signedInUser?.storageId}-${location.pathname}`} />} />
            <Route path="/job-book" element={<JobBookPrototypeScreen key={signedInUser?.storageId || 'account-pending'} />} />
            <Route path="/site-checks" element={<SiteChecksScreen />} />
            <Route
              path="/site-checks/checklists"
              element={isServiceOperationsAdministrator(signedInUser)
                ? <ChecklistAdminScreen />
                : <Navigate to="/site-checks" replace />}
            />
            <Route path="/scheduling" element={<SchedulingScreen />} />
            <Route path="/quotes" element={<QuotesScreen key={signedInUser?.storageId || 'account-pending'} />} />
            <Route path="/chargeable-invoices" element={<ChargeableInvoiceReviewScreen />} />
            <Route path="/pricing" element={<PricingScreen />} />
            <Route path="/wof" element={<WofScreen key={signedInUser?.storageId || 'account-pending'} accountId={signedInUser?.storageId || 'account-pending'} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>}
        </Suspense>
      </div>
    </div>
    </QuoteEditorOverlayProvider>
    </OperationalRealtimeProvider>
    </OperationalScreenPerformanceProvider>
    </OperationalDataClientProvider>
  )
}

export default App
