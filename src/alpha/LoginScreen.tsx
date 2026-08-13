import { useMsal } from '@azure/msal-react'

function LoginScreen() {
    const { instance } = useMsal()

    const handleLogin = () => {
        instance.loginRedirect({
            scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`],
        })
    }

    return (
        <main
            style={{
                minHeight: '100vh',
                display: 'grid',
                placeItems: 'center',
                background:
                    'radial-gradient(circle at top left, #e0f2fe 0, transparent 32%), linear-gradient(135deg, #fafafa, #f3f4f6)',
                fontFamily: 'Inter, system-ui, sans-serif',
                padding: '24px',
            }}
        >
            <section
                style={{
                    width: '100%',
                    maxWidth: '360px',
                    padding: '32px',
                    borderRadius: '24px',
                    background: 'rgba(255,255,255,0.72)',
                    border: '1px solid rgba(255,255,255,0.8)',
                    boxShadow: '0 24px 80px rgba(15, 23, 42, 0.10)',
                    backdropFilter: 'blur(18px)',
                }}
            >
                <div
                    style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '14px',
                        background: '#111827',
                        marginBottom: '28px',
                    }}
                />

                <p
                    style={{
                        fontSize: '12px',
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: '#6b7280',
                        margin: '0 0 8px',
                        fontWeight: 600,
                    }}
                >
                    Welcome back
                </p>

                <h1
                    style={{
                        fontSize: '28px',
                        lineHeight: 1.1,
                        fontWeight: 700,
                        margin: '0 0 12px',
                        color: '#111827',
                    }}
                >
                    Service Operations
                </h1>

                <p
                    style={{
                        fontSize: '14px',
                        lineHeight: 1.6,
                        color: '#6b7280',
                        margin: '0 0 28px',
                    }}
                >
                    Manage workshop jobs, staff, and daily service flow from one clean
                    workspace.
                </p>

                <button
                    onClick={handleLogin}
                    style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '999px',
                        border: 'none',
                        background: '#111827',
                        color: '#ffffff',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 10px 24px rgba(17, 24, 39, 0.18)',
                    }}
                >
                    Continue with Microsoft
                </button>
            </section>
        </main>
    )
}

export default LoginScreen
