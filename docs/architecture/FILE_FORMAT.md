# .pmgov File Format Specification

## 1. Format

A `.pmgov` file is UTF-8 encoded JSON.

It must contain:
- schemaVersion
- fileMetadata
- project
- workstreams
- stages
- milestones
- notes
- decisions
- actions
- links
- reports

## 2. Versioning

Current version: `1.0.0`.

The app must reject unsupported major versions with a clear error.

Patch/minor versions may be opened if compatible.

## 3. IDs

Use UUID v4 or `crypto.randomUUID()`.

All entities must have stable IDs.

## 4. Date format

All dates use ISO date strings:
`YYYY-MM-DD`

Timestamps use ISO datetime strings.

## 5. Referential integrity

Objects may reference each other using IDs.

The app must tolerate missing references by showing them as broken links rather than crashing.

## 6. File extension

Default extension:
`.pmgov`

MIME:
`application/json`
