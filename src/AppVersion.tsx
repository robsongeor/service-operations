import './AppVersion.css'

const buildVersion = import.meta.env.VITE_APP_VERSION?.trim() || 'Development'
const isRelease = import.meta.env.VITE_APP_VERSION_IS_RELEASE === 'true'

export default function AppVersion() {
    const tooltip = isRelease
        ? `Application version ${buildVersion}`
        : buildVersion.startsWith('Unreleased')
            ? `${buildVersion} — not an exact release tag`
            : `Application version ${buildVersion}`

    return (
        <span className="app-version" title={tooltip} aria-label={tooltip}>
            {buildVersion}
        </span>
    )
}
