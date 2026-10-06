import { useRef, useState, type CSSProperties } from 'react'
import './SidebarBrand.css'

export default function SidebarBrand() {
    const logoRef = useRef<HTMLButtonElement>(null)
    const stageRef = useRef<HTMLDivElement>(null)
    const [journey, setJourney] = useState<CSSProperties | null>(null)

    function play() {
        if (journey || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        const logo = logoRef.current?.getBoundingClientRect()
        const stage = stageRef.current?.getBoundingClientRect()
        if (!logo || !stage) return
        setJourney({
            '--pickup-x': `${logo.left - stage.left - 82}px`,
            '--exit-x': `${stage.width + 20}px`,
            '--cargo-y': `${logo.top - stage.top}px`,
        } as CSSProperties)
    }

    return (
        <div className={`sidebar-header${journey ? ' sidebar-header--working' : ''}`} style={journey ?? undefined}>
            <button
                ref={logoRef}
                type="button"
                className="sidebar-logo"
                aria-label="SO — double-click to play forklift animation"
                title="Double-click for a delivery"
                onDoubleClick={play}
                onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
                        event.preventDefault()
                        play()
                    }
                }}
            >SO</button>
            <div className="sidebar-brand">
                <strong>Service</strong>
                <span>Operations</span>
            </div>
            <div className="sidebar-forklift-stage" ref={stageRef} aria-hidden="true">
                {journey && (
                    <div className="sidebar-forklift" onAnimationEnd={(event) => {
                        if (event.animationName === 'forklift-journey') setJourney(null)
                    }}>
                        <svg width="124" height="80" viewBox="0 0 124 80" fill="none">
                            <g fill="#000000">
                                <path d="M8 51V47Q8 40 15 38L24 35L32 23Q35 18 41 18H49Q55 18 58 24L65 38L69 40Q74 42 74 48V53Q74 58 70 58H69A12 12 0 0 0 45 58H37A12 12 0 0 0 13 58Q8 58 8 51Z" />
                                <circle cx="25" cy="58" r="8.5" />
                                <circle cx="57" cy="58" r="8.5" />
                            </g>
                            <rect x="72" y="17" width="6" height="47" rx="3" fill="#d9383e" />
                            <g className="sidebar-forklift-forks">
                                <path d="M78 45Q81 45 81 48V58Q81 60 83 60H118Q121 60 121 62.5Q121 65 118 65H79Q75 65 75 61V48Q75 45 78 45Z" fill="#d9383e" />
                            </g>
                        </svg>
                        <div className="sidebar-forklift-cargo"><span className="sidebar-logo">SO</span></div>
                    </div>
                )}
            </div>
        </div>
    )
}
