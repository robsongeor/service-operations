# Routing architecture

Source owners: [App.tsx](../../src/App.tsx), [Sidebar](../../src/Sidebar.tsx) and
[capabilities](../../src/auth/applicationAccess.ts). Reviewed 10 October 2026.

## Management routes

With role enforcement enabled, the following client route sets apply. F = FullAccess,
C = ServiceCoordinator, O = Office Admin (JobCardAdmin), B = JobBookAdmin,
L = legacy JobBookOnly. These are navigation boundaries, not server authorization.

| Route | Purpose | Modes |
| --- | --- | --- |
| `/` | Overview launchpad for F; redirects C to Jobs, O to reviews, B/L to Job Book | F/C/O/B/L |
| `/customers` | Customer Dashboard | F/C/O/B |
| `/equipment` | Equipment Manager | F/C/O/B |
| `/jobs` | Service Coordination | F/C |
| `/job-book` | Job Book; live owner is still named JobBookPrototypeScreen | F/C/O/B/L |
| `/job-card-reviews`, `/job-card-reviews/:reviewId` | Office review queue/workspace | F/C/O |
| `/scheduling` | Scheduler | F/C |
| `/wof` | WOF/REGO | F/C |
| `/quotes` | Quotes; O read-only | F/C/O |
| `/pricing` | Pricing | F/C |
| `/staff`, `/mechanics` | Staff; old mechanics URL redirects to Staff | F |
| `/maintenance-booking` | Maintenance Booking | F |
| `/equipment/greentree-test` | GreenTree review; not dead despite filename | F |
| `/equipment-map`, `/job-map` | Operational maps | F |
| `/job-import` | Spreadsheet Job import | F |
| `/equipment-photos` | Office Equipment photo upload | F |
| `/site-checks` | Site Checks workspace | F |
| `/site-checks/checklists` | Checklist administration | F plus administrator predicate |
| `/chargeable-invoices` | Chargeable invoice review | F plus server/Dataverse feature authorization |

Unknown restricted routes show Access Denied; unknown FullAccess routes redirect to Overview.
No supported claim denies the management shell. Disabling role enforcement resolves FullAccess
client mode; never use that as a security workaround.

Office/Job Book Customer and Equipment screens use restricted mode but contain explicit
detail/location exceptions. See [authentication](authentication.md) for capabilities and
[security](security.md) for outstanding server-policy mismatches. Do not describe these screens
as wholly read-only.

## Public routes

`/portal/job` and `/portal/job/:token` render the Azure snapshot Job Card portal.
`/portal/site-check` and `/portal/site-check/:token` render the implemented Site Check
assignment portal. Both are checked before office authentication and have no office navigation.
Site Check implementation is not proof that its content/role/release gates have passed.

Every feature/public screen is a route-level lazy import. Authentication, navigation and small
loading boundaries stay in the shell. Preserve the MSAL callback bridge during bundle changes.

## Navigation and extension rules

- Reuse canonical drawers for embedded actions; do not create screen-specific Job editors.
- Preserve filters, selected tabs and scroll where practical.
- Keep public bearer-token routes outside the authenticated shell.
- A new route requires updates to App, Sidebar/capabilities, this matrix and server authorization tests.
- Test direct URLs and expired/unsupported-role sessions, not only visible menus.

See [public portal](public-portal.md), [security](security.md) and the
[retirement runbook](retirement-plan.md) before removing compatibility URLs.
