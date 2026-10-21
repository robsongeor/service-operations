const SPOKEN_FN = /\b(?:f|ef+)[\s.-]+(?:n|en)[\s.-]*(\d{2,})\b/gi
const WRITTEN_FN = /\bfn[\s.-]*(\d{2,})\b/gi
const CANONICAL_FN = /\bFN\d{2,}\b/i

export function canonicalizeWorkshopIdentifiers(value: string) {
    return value
        .replace(SPOKEN_FN, (_match, digits: string) => `FN${digits}`)
        .replace(WRITTEN_FN, (_match, digits: string) => `FN${digits}`)
}

export function normalizeWorkshopEquipmentQuery(value: string) {
    const canonical = canonicalizeWorkshopIdentifiers(value).trim()
    const rentalFleet = canonical.match(CANONICAL_FN)?.[0]
    return rentalFleet ? rentalFleet.toUpperCase() : canonical
}
