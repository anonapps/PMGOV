# Project Governance Workspace

Project Governance Workspace (PGW) is a local-first browser application for project managers to manage strategic governance data: workstreams, stages, milestones, notes, decisions, actions, and executive reporting.

## Local-first constraints

PGW does **not** use backend persistence, databases, authentication, user accounts, or server-side project storage. The application is designed to load, edit, and save a single user-controlled `.pmgov` file at a time. Project data should remain in browser memory until the user explicitly saves it back to a local `.pmgov` file.

## Getting started

Install dependencies:

```bash
npm install
```

Run the local development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Available scripts

```bash
npm run dev        # Start the Next.js development server
npm run build      # Create a production build
npm run start      # Start the production server after building
npm run lint       # Run ESLint
npm run typecheck  # Run TypeScript without emitting files
```

## Current implementation phase

Task 01 establishes the base Next.js App Router application with TypeScript strict mode, Tailwind CSS, ESLint, and the repository folders required for future implementation phases.

## Build order

Future work should follow the task files in `docs/tasks/` sequentially. Do not implement later task behavior until the corresponding task is started.
