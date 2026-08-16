export const JOB_DESCRIPTION_MAX_LENGTH = 4000

export function assertJobDescriptionLength(description: string) {
    if (description.length > JOB_DESCRIPTION_MAX_LENGTH) {
        throw new Error(`Job description must be ${JOB_DESCRIPTION_MAX_LENGTH.toLocaleString('en-NZ')} characters or fewer.`)
    }
}
