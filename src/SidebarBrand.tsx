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
            '--pickup-x': `${logo.left - stage.left - 60}px`,
            '--exit-x': `${stage.width + 15}px`,
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
                        <svg width="93" height="60" viewBox="0 0 124 80" fill="none">
                            <g fill="#0b0d0c">
                                <path d="M7 48C7 39 12 33 21 30L31 27L37 43H61L68 48V57H65A11 11 0 0 0 43 57H39A14 14 0 0 0 11 57H10C8 57 7 54 7 48Z" />
                                <path d="M29 42L35 15Q36 10 41 10H49Q54 10 56 15L65 43H58L50 18Q49 15 46 15H42Q39 15 38 19L33 42H29Z" />
                                <circle cx="25" cy="57" r="10.5" />
                                <circle cx="54" cy="57" r="7.5" />
                            </g>
                            <path d="M72 10H78V63H72Z" fill="#d9383e" />
                            <g className="sidebar-forklift-forks">
                                <path d="M75 45H80V58Q80 60 83 60H119Q122 60 122 63Q122 66 119 66H79Q75 66 75 62V45Z" fill="#d9383e" />
                            </g>
                        </svg>
                        <div className="sidebar-forklift-cargo"><span className="sidebar-logo">SO</span></div>
                    </div>
                )}
            </div>
        </div>
    )
}
