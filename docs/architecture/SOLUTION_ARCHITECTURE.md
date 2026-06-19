# Solution Architecture

## 1. Recommended technology

- Next.js App Router
- React
- TypeScript strict mode
- Tailwind CSS
- Zod for runtime validation
- Browser File API
- File System Access API where available, with download fallback
- Optional rich text editor: Tiptap

## 2. Architectural pattern

Client-only single-page application behaviour inside a Next.js app.

No backend API routes are required for MVP except static app delivery. If API routes are created, they must not persist project data.

## 3. State model

Use a central project state store.

Recommended options:
- Zustand for lightweight global state, or
- React context + reducer for no additional dependency.

State must track:
- current project data
- dirty/unsaved changes flag
- active view
- selected entity
- validation errors
- opened file metadata when available

## 4. File lifecycle

### New project
Create in memory using empty canonical project model.

### Open project
User selects `.pmgov`.
App reads JSON.
App validates against schema.
If valid, load into state.
If invalid, show error and do not modify current state.

### Save
If File System Access API handle exists, write to same file.
Otherwise download `.pmgov`.

### Save As
Always download `.pmgov`.

## 5. Persistence restrictions

Forbidden:
- localStorage as source of truth
- IndexedDB as source of truth
- server persistence
- database persistence

Allowed:
- temporary in-memory state
- optional localStorage only for UI preferences, never project content

## 6. Report generation

Reports are generated from current in-memory project state.

MVP export formats:
- Copy-ready Markdown
- Printable HTML view

Future formats:
- PPTX
- PDF
