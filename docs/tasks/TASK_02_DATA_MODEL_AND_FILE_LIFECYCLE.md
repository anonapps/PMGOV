# Task 02 — Data Model and File Lifecycle

## Goal
Implement `.pmgov` open/save lifecycle.

## Requirements
- Add TypeScript interfaces from `src/types/pmgov.ts`.
- Add runtime validation using `schemas/pmgov.schema.json` or Zod equivalent.
- Implement Create New Project.
- Implement Open File.
- Implement Save As.
- Implement dirty-state detection.

## Acceptance criteria
- User can create a new project.
- User can open `examples/sample-project.pmgov`.
- Invalid file displays clear error.
- Saving creates a `.pmgov` JSON file.
- No project data is sent to any server.
