export function deriveSiteNameFromAddress(address: string) {
    const segments = address
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean)

    // Geoapify formats NZ addresses as street, locality, city/district + postcode, country.
    // The locality immediately after the street is the useful Site name (for example, Drury).
    if (segments.length >= 4) return segments[1]
    if (segments.length === 3) return segments[1].replace(/\s+\d{4}$/, '').trim()
    if (segments.length === 2) return segments[1]
    if (segments.length === 1) return segments[0]
    return ''
}
