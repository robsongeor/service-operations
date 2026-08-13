function joinWords(words) {
    return words.map((word) => String(word.text || '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

function extractGreenTreePartyBlocks(pages) {
    const lines = Array.isArray(pages) ? pages.flatMap((page) => Array.isArray(page?.lines) ? page.lines : []) : []
    const descriptionIndex = lines.findIndex((line) => /^Description\s+Quantity\s+Price\s+Total$/i.test(String(line?.text || '').trim()))
    if (descriptionIndex < 1) return { accountSnapshot: null, customerSnapshot: null, siteSnapshot: null }
    // The GreenTree party box is two equal A4 columns; the invoice-line Quantity divider is farther right.
    // Use the stable page midpoint rather than deriving this boundary from the different table geometry below.
    const splitX = 297
    const rows = []
    for (let index = descriptionIndex - 1; index >= 0 && rows.length < 6; index -= 1) {
        const line = lines[index]
        const text = String(line?.text || '').trim()
        if (/\b(?:Order\s+No|GST\s+Reg|Our\s+Ref|Invoice\s+No)\b/i.test(text)) break
        const words = Array.isArray(line?.words) ? line.words : []
        if (!words.length) continue
        const left = joinWords(words.filter((word) => Number(word.x) < splitX))
        const right = joinWords(words.filter((word) => Number(word.x) >= splitX))
        if (left || right) rows.unshift({ left, right })
    }
    const left = rows.map((row) => row.left).filter(Boolean)
    const right = rows.map((row) => row.right).filter(Boolean)
    return {
        accountSnapshot: left[0] || null,
        customerSnapshot: left.join('\n') || null,
        siteSnapshot: right.join('\n') || null,
    }
}

function partyBlocksFromExtractionJson(value) {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value
        return extractGreenTreePartyBlocks(parsed?.pages)
    } catch {
        return { accountSnapshot: null, customerSnapshot: null, siteSnapshot: null }
    }
}

module.exports = { extractGreenTreePartyBlocks, partyBlocksFromExtractionJson }
