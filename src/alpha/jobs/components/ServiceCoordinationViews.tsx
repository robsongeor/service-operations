import type { CoordinationView } from '../types/serviceCoordination.types'
import './ServiceCoordinationViews.css'

type Props = {
    view: CoordinationView
    branchLabel?: string
    allBranchesEnabled: boolean
    watchlistEnabled: boolean
    onChange: (view: CoordinationView) => void
}

export default function ServiceCoordinationViews({
    view,
    branchLabel,
    allBranchesEnabled,
    watchlistEnabled,
    onChange,
}: Props) {
    return (
        <nav className="jobs-coordination-views" aria-label="Service Coordination view">
            <button type="button" className={view === 'branch' ? 'active' : ''} aria-pressed={view === 'branch'} onClick={() => onChange('branch')}>
                Home branch{branchLabel ? ` · ${branchLabel}` : ''}
            </button>
            {allBranchesEnabled && <button type="button" className={view === 'all' ? 'active' : ''} aria-pressed={view === 'all'} onClick={() => onChange('all')}>
                All branches
            </button>}
            {watchlistEnabled && <button type="button" className={view === 'watchlist' ? 'active' : ''} aria-pressed={view === 'watchlist'} onClick={() => onChange('watchlist')}>
                My watchlist
            </button>}
        </nav>
    )
}
