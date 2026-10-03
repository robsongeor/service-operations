import { buildJobRegistrationAction, type JobRegistrationCommand } from './jobRegistrationApi.ts'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>
/** Session/account scoped recovery, written BEFORE sending. Never invent a new ID on retry. */
export function registrationAttemptStore(storage: Storage, scope: string) {
    const key = `job-registration-attempt.v1.${scope}`
    return {
        read(): JobRegistrationCommand | null {
            const value = storage.getItem(key)
            if (!value) return null
            const command = JSON.parse(value) as JobRegistrationCommand
            buildJobRegistrationAction(command)
            return Object.freeze(command)
        },
        save(command: JobRegistrationCommand) {
            buildJobRegistrationAction(command)
            storage.setItem(key, JSON.stringify(command))
            if (storage.getItem(key) !== JSON.stringify(command)) throw new Error('Recovery details could not be stored. No request was sent.')
        },
        clear() { storage.removeItem(key) },
    }
}
