export const MAP_TILE_URL = import.meta.env.VITE_EQUIPMENT_MAP_TILE_URL || '/api/maptile/{z}/{x}/{y}'

export const MAP_TILE_OPTIONS = {
    maxZoom: 20,
    attribution: 'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> | <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">&copy; OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">&copy; OpenStreetMap contributors</a>',
}
