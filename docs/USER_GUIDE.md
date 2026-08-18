# Service Operations: Complete User Guide

Service Operations is the day-to-day workspace for forklift and materials-handling work. It keeps the important records together: customers, sites, equipment, jobs, schedules, technicians, quotes, compliance, site checks and chargeable invoices.

This guide is written for people who do not work with computer systems every day. It explains every area of the app, what it is for, and the normal steps to use it.

## Contents

1. [Getting started](#getting-started)
2. [How the records fit together](#how-the-records-fit-together)
3. [Using the screen](#using-the-screen)
4. [Customers](#customers)
5. [Staff](#staff)
6. [Equipment](#equipment)
7. [Equipment Map](#equipment-map)
8. [WOF / REGO](#wof--rego)
9. [Jobs](#jobs)
10. [Scheduling](#scheduling)
11. [Site Checks](#site-checks)
12. [Quotes and Pricing](#quotes-and-pricing)
13. [Chargeable Invoices](#chargeable-invoices)
14. [Technician job-card link](#technician-job-card-link)
15. [Detailed screen reference](#detailed-screen-reference)
16. [Common end-to-end tasks](#common-end-to-end-tasks)
17. [Help and troubleshooting](#help-and-troubleshooting)

## Getting started

1. Open Service Operations in your web browser.
2. Select **Continue with Microsoft**.
3. Sign in using your work Microsoft account.

The left-hand menu is the main way to move around the app. Select the small arrow at its top to make it narrower or wider. Your account details and sign-out option are at the bottom.

Only people with the right access will see restricted features, such as **Checklist Admin** and chargeable-invoice actions.

## How the records fit together

The system follows this simple chain:

```text
Customer
  -> Site
      -> Equipment
          -> Job
              -> Schedule, technician, job card, quote, maintenance and history
```

- A **customer** is the organisation you work for.
- A **site** is one of that customer's locations.
- **Equipment** is a forklift or other machine at that site.
- A **job** is a piece of work to be done.

When unsure where to start, open the customer first. This gives you the clearest view of its sites, equipment and open work.

## Using the screen

### Search, filters and lists

Most pages have a search box. Type a few letters, a job number, fleet number or serial number to reduce the list. Use filters and tabs to focus on the work you need.

Click a row, card or linked name to open its details. Many details open in a panel that slides in from the right. This is called a **side panel** in this guide.

### Saving and closing

- Select **Save**, **Save changes**, **Create**, or the named action to keep your changes.
- Select **Cancel**, **Close**, or the `X` only when you do not want to keep unsaved changes.
- Read confirmation boxes before continuing. They appear for important changes, especially deletions and completion actions.

> Search before creating a record. This prevents duplicate customers, equipment and jobs.

## Customers

Open **Customers** to work from the customer view. This is the best place to see a customer's sites, equipment, open jobs, quotes, contacts and general information together.

### Find or open a customer

1. Open **Customers**.
2. Start typing the customer name in the search box.
3. Select the customer from the results.
4. Use the page tabs to move between its sites, contacts, jobs, quotes and information.

The app normally remembers the customer you were last viewing during your signed-in session.

### Customer details and contacts

Use the customer information area to review or edit details such as accounts contact information, notes and purchase-order requirements. The Contacts tab shows customer-wide contacts and contacts linked to a particular site.

Purchase-order contacts can be set at customer level or overridden for an individual site. Use a site-specific override only when that site has different people who should receive PO requests.

### Sites

Each site section shows the site name, address, related equipment and key activity. From a site you can:

- Edit the site's name and address.
- Add equipment at that site.
- Open existing equipment.
- Create a job with the customer and site already selected.
- Open site settings.
- Transfer existing equipment to the site.
- Configure induction and safety requirements, including uploading site induction documents.
- View or run Site Checks when they are enabled.

Only transfer a machine when its current location has genuinely changed. Historical jobs stay with their original history even after a transfer.

### Site settings

Open the settings button beside a site to manage:

- Site details.
- Maintenance defaults for equipment at that site.
- Induction requirements and safety documents.
- Purchase-order recipients.
- Bulk equipment import.
- Site Check schedule and equipment scope.

When you set a default maintenance profile, new equipment at the site can inherit it. Applying a new default to existing equipment should be done carefully, as it changes several machine records.

## Staff

Open **Staff** to manage technicians and other service staff.

You can add a staff member, edit their name and contact details, and maintain the qualifications used for assigning work. Keep this information current so the right people appear in job assignment and Site Check lists.

Use staff records when allocating jobs, creating assignments, scheduling work and selecting a technician for a Site Check.

## Equipment

Open **Equipment** to find, add and maintain machines across all customers and sites.

### Find equipment

Use the search box to look for a fleet number, serial number, make or model. Select a record to open its side panel.

### Add equipment

1. Select the option to add equipment, or start from the correct customer site.
2. Enter the fleet number and serial number carefully.
3. Enter the make, model and other known machine details.
4. Choose the correct customer and site.
5. Save the record.

If a matching machine already exists, update it instead of creating another one.

### Equipment details

The equipment panel has sections for:

- **Details:** master information, customer/site, machine identifiers and road-use information.
- **Maintenance:** service programme, maintenance profile, hour-meter readings and service-plan information.
- **History:** jobs previously linked to that machine.

For equipment that operates on the road, record WOF and REGO information accurately. Use de-register or delete actions only when you understand the effect; preserving a historical record is usually safer.

### Maintenance and hour meters

Maintenance planning uses the machine's service programme, maintenance profile and hour-meter history. Enter the actual meter reading whenever possible. Estimated readings can be recorded where the option is offered, but should be used only when an actual reading is unavailable.

The latest accepted reading is important: a completed job cannot record a lower reading than the machine already has.

### Import equipment

Where enabled, the equipment area and site settings provide CSV or bulk import tools. Review every row before applying it. Resolve validation warnings and duplicate fleet or serial numbers rather than simply importing everything.

## Equipment Map

Open **Equipment Map** to see equipment locations visually.

Use it to quickly understand where machines are recorded, identify records without a usable location, and open a machine record for correction. Mapping is an aid to finding equipment; the customer, site and equipment record remains the official information to update.

## WOF / REGO

Open **WOF / REGO** to manage road-compliance work.

The table brings together equipment, registration number, customer, site, WOF expiry, workflow state and any related job. Use the tabs to focus on records that are due soon, overdue, already scheduled or otherwise need attention. Use search for fleet number, serial number, REGO, customer or job.

### Normal WOF workflow

1. Find the machine in **WOF / REGO**.
2. Open its equipment record or create/open the related WOF job.
3. Arrange and carry out the inspection.
4. When complete, update the inspection and new WOF expiry date.
5. Complete the job, entering the hour-meter reading if requested.

Use the page **Settings** button to choose how many days before expiry count as "due soon".

## Jobs

Open **Jobs** to create, allocate, track and complete work. This is the main operational work list.

### The Jobs list

The page has job-type tabs, status filters, search, sorting and settings. Use them to narrow the work list:

- Use the job-type tabs to focus on operational work, a particular job type, unconfirmed jobs, or all jobs.
- Use status filters to show only the job statuses you need.
- Use search to find a job number, customer, site, equipment or description.
- Select a column heading to sort the list.
- Use Settings to choose which scheduled jobs appear and save your preferred default view.

Some job-book controls allow selected job rows to be copied for a spreadsheet and job numbers to be assigned back in the same order. Use these only when you are confident the selected order is correct.

### Create a job

1. Select **+ Create job**.
2. Choose the job type.
3. Write a clear description of the required work.
4. Select the customer and site.
5. Select equipment if the work relates to a particular machine.
6. Add the technician, date and schedule information when known.
7. Save the job.

You can also create jobs from Customer and Equipment pages. Those entry points pre-fill the related information for you.

### Edit a job

Click a job to open its side panel. The available sections let you work with job details, relationships, schedule, office information, job card, quotes and technician assignments.

Common actions include:

- Change the job description, customer, site or equipment.
- Assign a primary technician or additional technicians.
- Add or change schedule options.
- Add office notes and flag work that needs office attention.
- Prepare an email to a technician.
- Open or create a linked quote.
- Update the job-card status.

Always save your changes before closing the panel.

### Complete a job

1. Open the job.
2. Change the operational status to **Complete**.
3. Follow the completion prompts.
4. Enter the meter reading shown on the machine when requested.
5. Confirm completion.

The app checks the job type and equipment before completion. For example, equipment-linked work requires a whole-number hour-meter reading that is not lower than the stored reading. Service jobs can also update maintenance history and service plans. WOF jobs collect the new expiry alongside the completion information.

## Scheduling

Open **Scheduling** for the seven-day planning board.

### Use the planner

1. Select **Today** to return to the current week.
2. Use the left and right arrows to move one week at a time.
3. Use the job-type tabs to focus on a type of work.
4. Choose **Expanded**, **Compact**, or **Today Expanded** to change how much detail cards show.
5. Click a job card to open the job and make changes.

Jobs marked **Flexible this week** appear separately because they can be completed on any suitable day. Schedule cards show the customer, job number, confirmation state, description, equipment/site, technician and time preference.

The planner shows the schedule; the job panel is where you save job details and assignment changes.

## Site Checks

Site Checks are scheduled checks for the equipment at a site. Open **Site Checks** for a cross-customer view of enabled Site Check sites.

### Review the Site Check list

Site Checks starts with **All enabled Sites**. Choose **Needs attention** to focus on overdue, due and in-progress checks, or use the totals and filters to narrow the list by status, technician, frequency, due date, customer or site.

- **Start** begins a due Site Check.
- **Open** shows the active check.
- **History** shows completed checks.

### Start a Site Check

1. Find the due site.
2. Select **Start**.
3. Check the customer, site, equipment and technician.
4. Mark any machine as available at site, temporarily off-site or in workshop if needed.
5. Confirm the start.

The app creates the appropriate Site Check jobs for the included equipment. From the details panel, use **Jobs & Equipment** to review the generated jobs, allocate job numbers and open the related job or equipment record.

### Set up a Site Check schedule

Schedules are configured from **Customers**, not from the main Site Checks page:

1. Open the customer and find the site.
2. Open that site's settings.
3. Open the Site Checks section.
4. Enable the schedule, choose the frequency and next due date.
5. Choose the equipment scope: all site equipment, Liftrucks rentals only, or a manual selection.
6. Save.

Disabling a schedule stops new checks but keeps its schedule information and history. It does not delete the jobs that were already created.

### Checklist administration

Users with administrator access see **Checklist Admin**. Use it to maintain the Site Check checklist content. This changes the check templates used by the business, so make changes carefully and ensure they are approved.

## Quotes and Pricing

### Quotes

Open **Quotes** to create and manage customer estimates.

The page includes a search box, quote status filters, and **All Quotes** / **My Quotes** tabs. It also shows the count and total value of the quotes currently displayed.

To create a quote:

1. Select **+ Create quote**.
2. Choose the customer, site, equipment and linked job where applicable.
3. Add quote lines, quantities, prices and notes.
4. Review the total and quote status.
5. Save.

Quotes can also be created from a Job. That is the easiest option when the quote is for known job work, because the link is filled in for you.

Open an existing quote to update its details, lines or status. Delete a quote only when it should not remain in the record; do not delete a quote merely because it was declined unless your office process requires that.

### Pricing

Open **Pricing** to maintain the standard items used in quotes. Add or edit items, descriptions and prices so quote writers can select consistent information.

Price changes affect future use of that item. Check the amount and description carefully before saving.

## Chargeable Invoices

**Chargeable Invoices** is an authorised manager workflow for reviewing GreenTree invoice PDFs before the work is finalised for processing.

### Import and preview

1. Open **Chargeable Invoices**.
2. Add one or more GreenTree invoice PDF files.
3. Wait for the import preview.
4. Check the invoice number, job match and warnings.
5. For an unmatched invoice, enter the correct job number and select **Set Job**, or create the job if it truly does not exist.
6. Choose the appropriate action for duplicates or revisions.
7. Import the selected ready items.

Only import records when the invoice and job relationship is correct. The workflow keeps historical evidence and is designed to prevent accidental duplicate processing.

### Review a queue item

Open an invoice from the queue to enter its workspace. Review the source invoice, matched job, lines, comparisons with revisions, corrections, photos, related quotes and purchase-order requirements.

Use the available actions to:

- Start or continue a review.
- Record corrections and review a revised invoice.
- Request or save supporting photos.
- Prepare customer PO documentation and an email draft where required.
- Mark the invoice **Ready** when all required work is complete.
- Select **Do Not Process** when it should not continue.
- Return a ready item to **In Progress** if further work is needed.

Permanent delete is intentionally difficult: it requires the invoice number to be typed and confirmed. Use it only for a record that must be completely removed under your approved process.

## Technician job-card link

Technicians can receive a secure job-card link from a job. They do not need the full office application to use it.

The technician opens the link, checks the job details, completes the required job-card information and submits it. Office staff then open the job's **Job Card** section to review the submission.

Only send the link to the intended technician. If a link must no longer be used, generate a new one from the job; this replaces the old link.

## Detailed screen reference

This section is the detailed reference for the controls people see in the app. It is useful when someone knows which screen they are on but does not know what a button or section is for.

### Customers screen: what each area does

| Area | What you see | What to do there |
| --- | --- | --- |
| Customer search | A customer search field and result list. | Type a customer name. Select a result to make it the current customer. |
| Customer header | The selected customer's name and actions. | Use it to edit customer information or create a new customer where your access allows it. |
| Sites tab | One section for each customer site. | This is the main working view: open equipment, create jobs, use site settings, transfer equipment or open Site Check details. |
| Contacts tab | Contacts and the sites they belong to. | Check phone and email details before dispatching work or preparing PO correspondence. |
| Open Jobs tab | Jobs belonging to the customer. | Open a job to update it; the drawer now opens with refreshed job, site, and equipment data. |
| Quotes tab | Quotes related to the customer. | Open an existing quote or create a new quote for this customer's work. |
| Customer information tab | Accounts details, PO requirements and notes. | Keep long-term customer information here rather than adding it to a single job description. |

#### Customer site actions, explained

Each site can show a number of actions. Their intended use is:

- **Create job:** starts a new job with the customer and site selected. Add the machine after starting if the work is equipment-specific.
- **Add equipment:** creates a machine at that site. Check the fleet and serial number before saving.
- **Open equipment:** opens the full machine record, including maintenance and job history.
- **Site settings:** opens the site's details, maintenance, inductions, PO and Site Check configuration.
- **Transfer equipment:** moves existing records into this site. It does not create a copy; it changes the machine's current site.
- **Bulk Add Equipment:** opens the import review for a group of machines at this site. The customer and site are preselected.
- **Run Site Check:** is available for due/overdue enabled Site Check schedules. It creates the occurrence and the related work jobs.
- **View Current Site Check / Site Check History:** opens the Site Check details panel. Use Summary for the current state, Jobs & Equipment for generated work, and History for older occurrences.

#### Site settings: detailed use

The site settings panel is a combination of several tasks. Save the relevant part of the panel after changing it.

| Settings section | Purpose | Important point |
| --- | --- | --- |
| Details | Correct the site name and address. | Job and customer searching relies on good site names. |
| Maintenance | Choose the site's default maintenance profile and optionally apply it to existing equipment. | Applying it to existing equipment changes multiple records. Review the selected machines first. |
| Inductions | Toggle induction requirements for this site and upload linked JSEA or safety documents. | The requirements field stores a checklist, and documents are loaded from the Inductions tab. |
| PO recipients | Decide who receives PO request emails for this site. | A site setting can override the customer's standard PO recipients. |
| Site Checks | Turn a schedule on/off and set its timing and equipment scope. | Disabling preserves history; it only prevents new occurrences. |
| Bulk Add Equipment | Import many new machines after reviewing each row. | Do not use it to update existing machines. Resolve duplicates in the review first. |

For PO recipients, choose one primary contact and add CC contacts if required. A site with no override normally inherits the customer-level list. The contact list itself does not prove that a PO was received; it only controls who is suggested for communication.

### Staff screen: detailed use

The Staff screen is the directory used by Jobs, Scheduling and Site Checks.

| Action | How to use it |
| --- | --- |
| Add staff member | Select the add action, enter the person's name and available contact details, then save. |
| Edit staff member | Open their row, correct details and save. |
| Manage qualifications | Open the qualification manager from the staff record and select the qualifications they hold. |
| Use in jobs | Select the staff member as the primary technician or an additional assignment on a job. |

Keep the staff member's contact details and qualifications accurate. A person who is no longer available should not be selected for newly planned work.

### Equipment screen: detailed use

The Equipment page is a register of machines. It has filters, search, a table and a full equipment panel.

#### Equipment list controls

| Control | Use |
| --- | --- |
| Search | Search fleet, serial, make, model or related location details. |
| Filters and status controls | Reduce the list to the class of equipment you need to review. |
| Add equipment | Create one record at a time. Use this for a single machine or a careful correction, not for a large list. |
| CSV/bulk import | Review rows from an import file, correct problems and select only valid rows to create. |
| Data-quality indicator | Shows records with missing or suspect information that needs attention. |
| Equipment row | Open the machine's side panel. |

#### Equipment panel: Details tab

The Details tab is the machine's core record. It can include its fleet number, serial number, make, model, customer, site, status and road-use details.

Use the Customer and Site selectors together. Equipment belongs at a site, and its customer relationship is normally determined through that site. If the machine has moved, use the transfer option from the correct customer site or update the location carefully; do not create another equipment record for the same physical machine.

Road-compliance fields are for machinery that needs them. Keep registration number and WOF expiry current, because WOF / REGO uses these values to identify work that is due.

#### Equipment panel: Maintenance tab

The Maintenance tab is for service planning. It can show the current hour meter, recorded date, power type, service programme, maintenance profile, service-plan status and next-service information.

Use it when:

- Setting up a machine's service programme for the first time.
- Checking why a service is due or overdue.
- Correcting maintenance configuration after an approved review.
- Recording or reviewing a maintenance-history update.

The settings work together. For example, power type and service programme decide which service-plan levels are relevant. If a completion form says maintenance setup is required, complete that setup before trying again.

#### Equipment panel: History tab

History lists jobs connected with this machine. Select a job to open the job record. This is a useful way to understand previous service, breakdown or compliance work without searching the whole job list.

#### Equipment import: safe process

1. Start the CSV or bulk import from Equipment or the destination site.
2. Confirm the customer and site shown at the top of the review.
3. Review every row marked invalid or duplicated.
4. Correct the source data where possible.
5. Select only rows you intend to create.
6. Confirm the import.
7. Read the results screen and note records that were not created.

Duplicate fleet and serial warnings are intentional protections. Ignoring a duplicate field means that value is not copied into the new record; it is not a way to merge machines.

### Equipment Map: detailed use

The map is a read-and-investigate tool for current equipment location.

| Control | Use |
| --- | --- |
| Search | Find by fleet, serial, make, site or customer. |
| Customer filter | Limit the map to one customer. |
| Site filter | Limit the map to one site. The choices adjust to the selected customer. |
| State filter | Choose active equipment, inactive equipment or all equipment. |
| Map point/site result | Open or inspect the equipment/site record. |

If a machine does not appear where expected, check its customer, site and address in the Equipment or Customer screen. The map cannot repair missing address data itself.

### WOF / REGO screen: detailed use

WOF / REGO is a work queue, not just a list of dates. It shows what is due and links the compliance record to the work needed to resolve it.

| Column or control | Meaning |
| --- | --- |
| Equipment | Fleet/serial and basic machine identity. Select it to open the machine. |
| REGO | The vehicle registration number. |
| Customer and site | The machine's current location. |
| WOF expiry | The date used to decide whether the record is current, due soon or overdue. |
| Workflow | Shows the WOF process state, such as no active job, scheduled or ready for update. |
| Job | The connected WOF job and its job status. |
| Action | The context-sensitive next action, such as creating/opening work or updating inspection/expiry. |
| Tabs | Focus the queue by WOF condition. |
| Search | Search equipment, REGO, customer or job. |
| Settings | Change the due-soon day threshold for your view. |

When the inspection is complete, use the WOF action to update both the inspection history and current expiry. Do not only edit a date on an unrelated job, because the WOF queue needs the compliance update to be recorded through its proper workflow.

### Jobs screen: detailed use

#### Jobs table columns

The standard table presents the important at-a-glance information:

| Column | What it tells you |
| --- | --- |
| Attention | An indicator appears when office attention is required. |
| Job | Job number and creation information. |
| Type | Breakdown, service, WOF, workshop or other job classification. |
| Equipment | Linked fleet number, make/model and serial, when there is equipment. |
| Customer / site | Where the work is for. |
| Description | What needs to be done. |
| Contact | Site contact information, if entered. |
| Mechanic | Primary assigned technician. |
| Status | The operational position of the work. Some status changes can be made directly in the table. |
| Order | Purchase order/order number. |
| Latest update | The newest office note. |
| Actions | Select/copy job-book information and prepare a technician email where available. |

Use the filter **Needs Attention** when you are working through office follow-ups. Use **No Attention Required** when you need to focus on normal work without those flags.

#### Job panel: sections and actions

The exact fields vary by job type, but the job panel normally covers the following:

| Section | What it is for |
| --- | --- |
| Core details | Job type, description, number, status and basic work details. |
| Relationships | Customer, site, site contact and equipment. Use the search fields to avoid creating duplicates. |
| Schedule | Planned date, time/flexibility, confirmation state and scheduled options. |
| Assignments | Primary technician and additional technicians. |
| Office | PO/order information, office-attention flag and a dated update history. |
| Job Card | Technician job-card state and submitted information. |
| Quotes | Linked quotes; open an existing quote or create one for this job. |

For a job with more than one technician, keep the primary technician correct and add others through assignments. The additional assignment list is also where their job email can be prepared.

#### Job scheduling options

A job can have schedule options that describe how it fits into the work plan:

- **Flexible this week:** can be completed on any suitable day that week.
- **Any time:** has a date but no specific time requirement.
- **Morning:** should be completed in the morning.
- **After time:** cannot start before a stated time.
- **Exact time:** has a specific planned time.

Mark an option confirmed only when the appointment is actually confirmed. This lets the weekly Scheduling board distinguish firm bookings from possible times.

#### Job book copy/paste

The Jobs table supports a controlled spreadsheet handoff.

1. Filter and sort the list into the order you want.
2. Select the job rows you need, or use the row copy control for a single row.
3. Copy the job-book information into the external spreadsheet.
4. To allocate returned job numbers, make sure one numeric job number is present per selected row, in the same visible order.
5. Use the paste/allocate action and carefully check the confirmation.

Do not change the sort/filter or selection between copying rows and allocating numbers, because the order is important.

#### Completing work: what the prompts change

Completion is more than a label change. The app shows a confirmation because it can update related records.

| Job type | Completion can update |
| --- | --- |
| Standard equipment job | Job completion date, job hour meter, equipment's current hour meter and job status. |
| Service job | The standard changes plus service history, maintenance schedule and next-service timing. |
| WOF job | Job completion date, WOF inspection history, equipment current WOF expiry, current hour meter and job status. |
| Site Check job | Operational job progress, which contributes to the Site Check occurrence's progress. |

If the completion prompt says the meter is invalid, read the message and use the actual machine reading. If it says maintenance setup is missing, configure the power type, service programme, maintenance profile and required service levels in the completion panel, save that setup, then finish the job.

### Scheduling screen: detailed use

The Scheduling screen is intentionally simple: it is a weekly visual plan of jobs that already have schedule options.

| Control | Result |
| --- | --- |
| Today | Returns the board to the current Monday-Sunday week. |
| Previous / Next arrows | Moves the board back or forward one full week. |
| Expanded | Shows all card details. |
| Compact | Shows shorter cards, useful when the week is busy. |
| Today Expanded | Shows today in detail and other days compactly. |
| Job type tabs | Hides schedule cards that are not the selected job type. |
| Flexible this week lane | Holds jobs that have no specific day in the week. |
| Day card | Opens the related job panel. |

The board may hide historical Site Check schedule options. Site Checks are controlled through the dedicated Site Checks workflow rather than managed as ordinary planner appointments.

### Site Checks screen: detailed use

#### Site Check list controls

| Control | Use |
| --- | --- |
| Status totals | Quickly filter by due, overdue, in-progress and up-to-date state. |
| Needs attention view | Focuses the register on overdue, due and in-progress sites. |
| Customer/site search and filters | Narrow the cross-customer list. |
| Technician filter | Find checks owned by a particular technician. |
| Frequency and due-date filters | Plan periodic work. |
| Start | Begins a due occurrence after a review. |
| Open | Opens the active occurrence. |
| History | Opens the site's completed check history. |

#### Run Site Check panel

Before starting, the panel identifies the customer, site, frequency, due date, technician and equipment included. It can also call out exclusions, such as a machine currently in workshop or temporarily off-site.

Use the availability controls accurately:

- **Available at site:** normal inclusion in this and future checks.
- **Temporarily off-site:** excluded from the current occurrence.
- **In workshop:** excluded from the current occurrence.

Starting creates the occurrence and its jobs as one coordinated process. If the action reports an error, do not retry repeatedly; close/reopen or use the stated retry action so the app can check whether it already created the occurrence.

#### Site Check details panel

| Tab | What you use it for |
| --- | --- |
| Summary | Check the occurrence, schedule snapshot, technician, dates, progress and any integrity warnings. |
| Jobs & Equipment | View generated jobs, included/excluded equipment, job-book handoff and open linked jobs/equipment. |
| History | Review earlier occurrences for the site. |

Complete the generated jobs normally. The Site Check becomes complete when its operational job work is complete; changing a job-card state by itself does not complete the operational job.

### Quotes screen: detailed use

#### Quote register controls

| Control | Use |
| --- | --- |
| Create quote | Opens a blank quote editor. |
| Search | Find by quote number, title, job, customer, fleet, serial or creator. |
| Status buttons | Restrict the list to one quote status. |
| All Quotes | Shows all quotes you can access. |
| My Quotes | Shows quotes created by your signed-in account. |
| Date heading | Changes the quote-date sort direction. |
| Quote row | Opens the quote editor and loads its lines. |

#### Quote editor: header fields

| Field | How to use it |
| --- | --- |
| Author | Shows who created the quote. |
| Quote title | Give the quote a meaningful title. For a job-linked quote, the job/equipment/description portion is kept as a protected starting title; add extra wording after it. |
| Job | Link the quote to existing work when applicable. Selecting a job helps keep the customer and equipment context correct. |
| Customer | Select the customer for an unlinked or customer-level quote. |
| Equipment | Select a machine where the quote is equipment-specific. |
| Status | Set the current quote stage. Update this as the quote progresses. |
| Revision | Identify which revision of the quote this is. |
| Quote date | Date of the offer. |
| Valid until | Optional expiry date for the offer. |

#### Quote editor: lines and totals

Each line has a catalogue item (optional), description, category, quantity, unit, unit price, extended value and GST choice. Selecting a catalogue item copies its current standard information into the quote line; you can then adjust that line without changing the catalogue.

Use **+ Add line** for another item. Use the remove action on a line only after checking it is not required. The totals area calculates subtotal, GST and total. Adjust the GST rate only when appropriate for the quote.

The Notes area is for customer-facing or internal quote notes. Keep notes clear because they can be included in output documents.

#### Quote editor: output actions

After a quote is saved, additional actions can be available:

- **Generate and save PDF:** creates a provisional quotation PDF. It is not a tax invoice.
- **Open PO request email:** prepares an editable email draft for the configured customer/site PO contacts.
- **Copy Table:** copies formatted quote lines and totals for pasting into another document.
- **Delete quote:** removes the quote after confirmation.

### Pricing screen: detailed use

The Pricing screen is the catalogue behind quote lines. It makes repeated quote items consistent.

| Field | Purpose |
| --- | --- |
| Name | Short catalogue item name, such as standard labour. |
| Code | Optional internal shorthand, such as `LABOUR`. |
| Category | Classifies the item for quote reporting and selection. |
| Description | Default wording copied onto quote lines. |
| Unit label | The charging unit, such as hour, each, km or job. |
| Unit price (ex GST) | The default charge before GST. |
| Sort order | Optional order for easier catalogue use. |
| Charge GST | Decides the default GST setting when the item is selected. |

Changing a pricing item does not silently change already saved quote lines. Review standard price changes before saving so future quotes are correct.

### Chargeable Invoices screen: detailed use

#### Queue and filters

The first screen is the review queue. It excludes staging and failed imports from the normal active-work list. Use the queue selection and filters to find active reviews, including items waiting for action.

#### Import preview table

Each PDF is previewed before it is imported. The preview shows:

| Item | What to check |
| --- | --- |
| File | Confirm it is the invoice you meant to add. |
| Invoice number/date | Check the extracted invoice identity. |
| Our Ref / job | Confirm the exact job match. |
| Duplicate/revision state | Choose whether to import as a revision or skip, where the app asks. |
| Warnings or errors | Resolve these before selecting the file for import. |

For an unmatched invoice, type the job number and select **Set Job**, or use **Create Job** only when a job genuinely needs to be created. Remove an item from the batch if it was added by mistake.

#### Invoice workspace: practical order of work

Work through an imported review in this order:

1. Check the source PDF and invoice details.
2. Confirm the job, customer, site and equipment relationship.
3. Review extracted invoice lines and the comparison with an earlier revision, if present.
4. Add/resolve corrections or amendments required by the business.
5. Review whether technician photos or PO work are needed.
6. Use related quotes as context where they exist.
7. Save supporting documents and prepare correspondence when required.
8. Mark the review **Ready** only when the required work is genuinely complete, or choose **Do Not Process** when it must stop.

The app records activity and retains evidence. A ready item can be deliberately returned to In Progress, but that action should be used only when further review is needed.

### Technician job-card page: detailed use

This is the page reached through a technician's secure link. It is separate from the signed-in office app.

The top of the page shows job number, equipment, fleet number, customer, site and work required. The technician then completes the following sections:

| Section | What to enter |
| --- | --- |
| Time & Travel | Date, total hours and kilometres for each entry. Add more entries for more than one day; remove an incorrect row. Hours must be between 0 and 24. |
| Parts | Each part used. Add rows as needed and remove empty/error rows. |
| Further work required | Tick it only when more work is needed, then enter the required details. |
| Photos | Add up to 20 photos from the camera or photo library; remove any accidental image before submitting. |
| Safety issue identified | Tick it when a safety issue was found and enter enough detail for the office to act on it. |

Select **Submit Job Card** when all information is complete. A confirmation page tells the technician the office has received it. If the link says the job card is unavailable, it may have expired, been replaced, or not be valid for that job; contact the office rather than trying to reuse it.

## Common end-to-end tasks

### New customer with a machine and a job

1. Create or find the customer in **Customers**.
2. Add the site and its address.
3. Add the equipment against the correct site.
4. Create the job from the site or equipment record.
5. Assign the technician and schedule it.
6. Complete the job after the work is done.

### Breakdowns and urgent work

1. Search **Jobs** for an existing open job first.
2. If none exists, create a new job with a clear description and correct site/equipment.
3. Assign a technician and set the date or time requirement.
4. Use **Scheduling** to see the work in the weekly plan.
5. Track office updates and job-card information on the job.
6. Complete the job with the correct hour-meter reading if required.

### Regular service work

1. Open the equipment and check its maintenance details.
2. Create or open the service job.
3. Assign and schedule the work.
4. On completion, enter the actual hour-meter reading.
5. Follow the service completion prompts so maintenance history and plans stay accurate.

### A WOF is close to expiry

1. Find the machine in **WOF / REGO**.
2. Create or open the WOF job.
3. Schedule the inspection.
4. Record the inspection result and new expiry date.
5. Complete the job.

### Scheduled Site Check

1. Configure the schedule in the site's settings if it is not already enabled.
2. When due, find the site in **Site Checks**.
3. Start the check and select the technician.
4. Use generated jobs to track work on each included machine.
5. Complete the generated jobs as work is carried out.
6. Review the completed check in History.

## Help and troubleshooting

### A page will not load

1. Wait briefly, then select **Try again** if it appears.
2. Check your internet connection.
3. Sign out and back in if the app asks you to reconnect to Microsoft.
4. If it continues, take a screenshot and tell the administrator which page and record you were working on.

### Save or create shows an error

Do not keep pressing the button. First check whether the item was saved, then correct the information or ask for help. Repeated attempts can create duplicates.

### I cannot see a feature or action

Your access may not include it. Ask the system administrator rather than using someone else's account.

### Useful words

- **PO:** purchase order - the customer's authorisation or order reference.
- **REGO:** vehicle registration.
- **WOF:** warrant of fitness.
- **Job card:** the technician's record of work completed.
- **Side panel:** the form that slides in from the right when you open or edit something.
- **Status:** the current stage of a job, quote, Site Check or invoice.
