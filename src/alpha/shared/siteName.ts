export function deriveSiteNameFromAddress(address: string) {
    const segments = address
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean)

    if (segments.length >= 3) return segments[segments.length - 2]
    if (segments.length === 2) return segments[1]
    if (segments.length === 1) return segments[0]
    return ''
}
