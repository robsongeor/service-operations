// Loaded only by jobCardAdminWalkthrough.mjs; never imported by the production entry point.
const bookAdmin = import.meta.env.VITE_UNIFIED_JOB_WALKTHROUGH === 'true' && sessionStorage.getItem('job-card-walkthrough-role') === 'book-admin'
const administrator = bookAdmin ? 'book-admin' : import.meta.env.VITE_UNIFIED_JOB_WALKTHROUGH === 'true' && sessionStorage.getItem('job-card-walkthrough-role') === 'coordinator' ? 'coordinator' : sessionStorage.getItem('job-card-walkthrough-actor') === 'jess' ? 'jess' : 'nargiza'
const account = {
    homeAccountId: `walkthrough-${administrator}`, localAccountId: `walkthrough-${administrator}`,
    tenantId: 'walkthrough-only', username: `${administrator}@example.invalid`,
    name: bookAdmin ? 'Sample Job Book Admin' : administrator === 'coordinator' ? 'Sample coordinator' : `${administrator === 'jess' ? 'Jess' : 'Nargiza'} (sample administrator)`,
    idTokenClaims: { roles: [bookAdmin ? 'ServiceOperations.JobBookAdmin' : administrator === 'coordinator' ? 'ServiceOperations.ServiceCoordinator' : 'ServiceOperations.JobCardAdmin'] },
}
const accounts = [account]
const instance = {
    getActiveAccount: () => account, getAllAccounts: () => accounts,
    setActiveAccount: () => {}, addEventCallback: () => 'walkthrough', removeEventCallback: () => {},
    acquireTokenSilent: async () => ({ accessToken: `walkthrough-${administrator}` }),
}
export function useMsal() { return { accounts, instance, inProgress: 'none' } }
