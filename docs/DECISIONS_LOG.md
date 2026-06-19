# Decisions Log

## 2026-06-18
- Initial repository setup generated from Codex Cloud pack.

## 2026-06-19
- Task 02 reconciles the file-format requirement for a top-level `reports` array by adding `reports` to the TypeScript model, JSON Schema, and sample `.pmgov` file. Report generation UI remains deferred to Task 08.
- Runtime validation uses Zod as the schema-equivalent implementation in app code while keeping `schemas/pmgov.schema.json` as the file-format reference artifact.
- Task 02 implements Save As with a browser Blob download only. Direct overwrite through File System Access API is deferred because Task 02 explicitly requires Save As and local-only persistence.
- Task 03 keeps page content as placeholders only and retains Task 02 file lifecycle in the shared shell to avoid implementing Workstreams, Notebook, Governance, Dashboard, or Reports behavior early.
- Save and Save As both use explicit browser downloads because there is no persistent file handle without adopting additional browser APIs; no project data is sent to a backend.
