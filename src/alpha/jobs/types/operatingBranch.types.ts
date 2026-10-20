export const OPERATING_BRANCHES = {
    AUCKLAND: 122830000,
    WAIKATO: 122830001,
    HASTINGS: 122830002,
    CHRISTCHURCH: 122830003,
} as const

export type OperatingBranch = typeof OPERATING_BRANCHES[keyof typeof OPERATING_BRANCHES]

export const OPERATING_BRANCH_LABELS: Readonly<Record<OperatingBranch, string>> = {
    [OPERATING_BRANCHES.AUCKLAND]: 'Auckland',
    [OPERATING_BRANCHES.WAIKATO]: 'Waikato',
    [OPERATING_BRANCHES.HASTINGS]: 'Hastings',
    [OPERATING_BRANCHES.CHRISTCHURCH]: 'Christchurch',
}
