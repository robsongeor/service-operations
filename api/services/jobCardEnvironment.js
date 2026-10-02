// A hosted process must never accept the local authentication/storage shortcuts.
function isHosted() {
    return Boolean(process.env.WEBSITE_INSTANCE_ID || process.env.WEBSITE_HOSTNAME
        || process.env.FUNCTIONS_WORKER_RUNTIME || process.env.NODE_ENV === 'production')
}

function isLocalDevelopment() {
    return !isHosted() && process.env.JOB_CARD_LOCAL_DEVELOPMENT === 'true'
        && process.env.JOB_CARD_STORAGE_MODE === 'memory'
}

module.exports = { isHosted, isLocalDevelopment }
