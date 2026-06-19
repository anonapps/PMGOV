# Master Codex Prompt — Project Governance Workspace

You are building **Project Governance Workspace (PGW)**.

PGW is a local-first web application for Project Managers to manage strategic project governance: workstreams, stages, milestones, meeting notes, decisions, actions and executive reporting.

## Absolute constraints

You must not introduce:

- Backend APIs for persistence
- Supabase, Firebase or any database
- Login/authentication
- User accounts
- Server-side storage of project data
- Jira, Outlook, Teams or Google integrations
- Resource planning
- Budget tracking
- Sprint/backlog/task execution tracking

The application must load, edit and save a single local `.pmgov` file.

## Required implementation behaviour

The user opens the app, creates or opens one project file, edits the project in memory, and explicitly saves the project back to a `.pmgov` file.

Autosave is not required for MVP. The app must clearly indicate unsaved changes.

## Primary UX philosophy

The app is not Jira, Microsoft Project, Monday, Smartsheet or OneNote.

It is a **project governance workspace**:
- Milestones are the leading indicator.
- Workstreams organise the project.
- Notes are the primary capture mechanism.
- Decisions and actions are extracted governance objects.
- Reports are the primary output.

## Implementation source of truth

Follow the files in this order:

1. `docs/product/PRD.md`
2. `docs/architecture/SOLUTION_ARCHITECTURE.md`
3. `docs/architecture/FILE_FORMAT.md`
4. `schemas/pmgov.schema.json`
5. `src/types/pmgov.ts`
6. `docs/ux/UX_SPEC.md`
7. `docs/tasks/*.md`

If a conflict exists, ask for clarification only if it blocks implementation. Otherwise choose the simpler MVP-compatible option and document it in `docs/DECISIONS_LOG.md`.

## Definition of done

A build phase is complete only when:

- TypeScript compiles.
- Lint passes.
- Unit tests pass where implemented.
- Manual acceptance criteria in the task file pass.
- No backend persistence exists.
- `.pmgov` open/save works after Phase 2.
