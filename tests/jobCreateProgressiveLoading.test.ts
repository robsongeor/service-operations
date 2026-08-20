import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const readSource = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const jobsScreenSource = readSource('../src/alpha/jobs/JobsScreen.tsx')
const useJobsSource = readSource('../src/alpha/jobs/hooks/useJobs.ts')
const jobCreateDrawerSource = readSource('../src/alpha/jobs/components/JobCreateDrawer.tsx')
const relationshipFieldsSource = readSource('../src/alpha/jobs/components/JobRelationshipFields.tsx')
const equipmentCreateSource = readSource('../src/alpha/equipment/components/EquipmentJobCreateDrawer.tsx')

test('Job creation opens immediately without the legacy broad reference-data gate', () => {
    const createButtonStart = jobsScreenSource.indexOf('className="jobs-create-button"')
    const createButtonEnd = jobsScreenSource.indexOf('</button>', createButtonStart)
    const createButton = jobsScreenSource.slice(createButtonStart, createButtonEnd)

    assert.ok(createButtonStart >= 0)
    assert.doesNotMatch(createButton, /prepareJobEditorReferenceData/)
    assert.match(createButton, /setIsCreatingJob\(true\)/)
    assert.doesNotMatch(equipmentCreateSource, /prepareJobEditorReferenceData/)
    assert.doesNotMatch(equipmentCreateSource, /equipment-job-load-overlay/)
})

test('Job creation loads exact dependencies progressively with local retry states', () => {
    assert.match(jobCreateDrawerSource, /equipmentDependencyStatus/)
    assert.match(jobCreateDrawerSource, /onLoadEquipment\(draft\.equipmentId, controller\.signal\)/)
    assert.match(jobCreateDrawerSource, /onLoadEquipmentServicePlans\(draft\.equipmentId, controller\.signal\)/)
    assert.match(relationshipFieldsSource, /siteLoadStatus/)
    assert.match(relationshipFieldsSource, /contactLoadStatus/)
    assert.match(relationshipFieldsSource, /Loading Sites for this Customer/)
    assert.match(relationshipFieldsSource, /Loading Contacts for this Site/)
})

test('Job consumers share the cached Staff directory instead of fetching it in initial Job loading', () => {
    const initialLoadStart = useJobsSource.indexOf('const loadInitialData = async () =>')
    const initialLoadEnd = useJobsSource.indexOf('void loadInitialData()', initialLoadStart)
    const initialLoad = useJobsSource.slice(initialLoadStart, initialLoadEnd)

    assert.ok(initialLoadStart >= 0)
    assert.match(useJobsSource, /useOperationalQuery<Mechanic\[\]>/)
    assert.match(useJobsSource, /STAFF_DIRECTORY_QUERY_KEY/)
    assert.doesNotMatch(initialLoad, /fetchStaffDirectory/)
})
