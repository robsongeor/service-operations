// Enabled only by the opt-in local proxy. Production behaviour is unchanged.
export const JOB_CARD_READ_ONLY = import.meta.env.DEV && import.meta.env.VITE_JOB_CARD_READ_ONLY === 'true'
export const JOB_CARD_READ_ONLY_MESSAGE = 'Local Job Card access is read-only. Review updates and email retries are disabled.'
