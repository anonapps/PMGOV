# Product Requirements Document — Project Governance Workspace

## 1. Product summary

Project Governance Workspace is a local-first browser application for Project Managers who manage IT projects, software delivery initiatives and organisational change programmes.

The product focuses on strategic governance, not development execution. It helps PMs manage:
- Workstreams
- Delivery stages
- Milestones
- Meeting notes
- Decisions
- Actions
- Executive-ready reports

## 2. Target users

### Primary user
Project Manager.

### Secondary future user
Programme Manager.

### Report consumers
VPs, Product Owners, Sponsors, Steering Committees and other stakeholders who receive generated reports rather than logging into the tool.

## 3. MVP goal

Allow a PM to manage a single project using a local `.pmgov` file and generate executive-ready status reporting.

## 4. MVP scope

In scope:
- Create new project file.
- Open existing `.pmgov` project file.
- Save project file.
- Manage workstreams.
- Manage stages within workstreams.
- Manage milestones within stages.
- Capture rich/free-form notes.
- Create decisions.
- Create actions.
- Link decisions/actions/milestones/notes.
- Dashboard focused on milestone attention.
- Generate executive status report.
- Export report as copy-ready Markdown/HTML in MVP.

Out of scope:
- Multi-project workspace.
- Programme rollups.
- Collaboration.
- Templates.
- Backend storage.
- User accounts.
- Authentication.
- Budget.
- Resource planning.
- Jira integration.
- Calendar/email integration.
- Full PowerPoint generation in MVP.

## 5. Design principles

1. Local-first confidentiality.
2. One project file at a time.
3. Milestones are the leading indicator.
4. Workstreams are the core project structure.
5. Notebook is the main input mechanism.
6. Governance objects should be traceable.
7. Reporting is a core feature.

## 6. Core workflow

1. PM opens project file.
2. PM reviews milestone dates and variance.
3. PM updates workstream and milestone status.
4. PM captures meeting notes.
5. PM extracts decisions and actions from notes.
6. PM generates executive status report.
7. PM saves `.pmgov` file.

## 7. MVP success criteria

The MVP is successful if a PM can maintain project governance and produce a credible executive update without using Jira, MS Project, Smartsheet, OneNote or Excel as the primary source of truth.
