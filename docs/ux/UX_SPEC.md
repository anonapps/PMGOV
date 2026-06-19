# UX Specification

## Global layout

Use a two-zone layout:

- Left sidebar navigation
- Main content area

Navigation:
- Dashboard
- Workstreams
- Timeline
- Notebook
- Governance
- Reports
- Settings

Top bar:
- Project name
- Unsaved changes indicator
- Open
- Save
- Save As

## Start screen

When no project is open:
- Show product name.
- Primary CTA: Create New Project.
- Secondary CTA: Open .pmgov File.
- Show privacy statement: "Your project data is stored only in the file you open or save."

## Dashboard

Dashboard ordering:
1. Milestones requiring attention
2. Upcoming milestones
3. Workstream health
4. Open actions
5. Recent decisions
6. Executive summary

Milestone requiring attention if:
- status is amber or red
- forecastDate is later than plannedDate
- due within next 30 days and not complete
- plannedDate or forecastDate is in the past and not complete

## Workstreams screen

Left column:
- Workstream list

Main area:
- Selected workstream details
- Stages
- Milestones grouped by stage

Actions:
- Add workstream
- Edit workstream
- Add stage
- Add milestone

## Timeline screen

Display roadmap grouped by workstream and stage.

MVP can use a table-style timeline if graphical Gantt is too costly:
- Workstream
- Stage
- Milestone
- Planned
- Forecast
- Actual
- Variance
- Status

## Notebook screen

Left column:
- Notes list
- Search/filter by title/tag/type

Main area:
- Note title
- Note type
- Rich text/content editor
- Save note

Governance extraction MVP:
- Button: Create Action from Note
- Button: Create Decision from Note
- User manually fills modal, with note linked automatically.

Advanced text-highlight extraction may be deferred if implementation complexity is high.

## Governance screen

Tabs:
- Actions
- Decisions

Actions table:
- Description
- Owner
- Due Date
- Status
- Linked note

Decisions table:
- Date
- Title
- Decision maker
- Impact
- Linked note

## Reports screen

Generate Executive Status Report.

Report sections:
- Project health
- Executive summary
- Workstream status
- Milestones requiring attention
- Upcoming milestones
- Key decisions
- Open actions

MVP export:
- Copy Markdown
- Printable HTML
