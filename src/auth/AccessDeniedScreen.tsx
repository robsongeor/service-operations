import type { ApplicationAccess } from './applicationAccess'
import type { SignedInUserInfo } from './signedInUser'
import './AccessDeniedScreen.css'

export default function AccessDeniedScreen({
    access,
    user,
    restrictedRoute = false,
}: {
    access: ApplicationAccess
    user: SignedInUserInfo | null
    restrictedRoute?: boolean
}) {
    return <main className="access-denied-screen">
        {access.isSimulated && <div className="access-simulation-banner" role="status">
            Simulating {access.mode} access — this is a navigation test, not a security test.
        </div>}
        <section className="access-denied-card" aria-labelledby="access-denied-title">
            <span>ACCESS CONTROL</span>
            <h1 id="access-denied-title">{restrictedRoute ? 'This area is not available' : 'Access has not been assigned'}</h1>
            <p>{restrictedRoute
                ? 'Your account is limited to the Legacy Job Book. Return to the Job Book to continue.'
                : 'Your account is signed in but does not have an application role for Service Operations.'}</p>
            {user && <small>Signed in as {user.displayName}</small>}
            {restrictedRoute && <a href="/job-book">Return to Legacy Job Book</a>}
        </section>
    </main>
}
