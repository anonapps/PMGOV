import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExecutiveReportMarkdown,
  buildPortfolioExecutiveReportMarkdown,
  calculatePortfolioHealth,
  getActiveProjectWorkspace,
  calculateProjectHealth,
  calculateWorkstreamHealth,
  createEmptyProjectFile,
  formatMilestoneVariance,
  getMilestoneAttentionReasons,
  parsePmgovJson,
  preparePmgovForSave,
  deletePortfolioProject,
  switchActiveProjectWorkspace,
  serializePmgovFile,
  validatePmgovFile,
} from "../src/lib/pmgov";
import type { PmgovFile } from "../src/types/pmgov";

function fixture(): PmgovFile {
  const file = createEmptyProjectFile();
  file.project.name = "QA Project";
  file.project.projectManager = "Ada";
  file.workstreams.push({ id: "ws-1", name: "Delivery", status: "amber", sortOrder: 1, commentary: "Needs focus" });
  file.stages.push({ id: "stage-1", workstreamId: "ws-1", name: "Build", status: "in_progress", sortOrder: 1 });
  file.milestones.push({ id: "ms-1", stageId: "stage-1", name: "Pilot", plannedDate: "2026-06-25", forecastDate: "2026-07-02", status: "amber" });
  file.actions.push({ id: "a-1", description: "Confirm launch owner", owner: "", dueDate: "2026-06-18", status: "open" });
  file.dependencies.push({ id: "dep-1", title: "API contract", description: "Need interface signed off", sourceWorkstreamId: "ws-1", targetWorkstreamId: "ws-1", owner: "Grace", dueDate: "2026-06-19", status: "blocked", commentary: "Waiting on vendor" });
  file.decisions.push({ id: "d-1", title: "Use local files", decisionText: "No backend for MVP.", decisionDate: "2026-06-10" });
  file.risks.push({ id: "r-1", title: "Vendor delay", description: "Supplier may miss onboarding.", owner: "Grace", probability: "high", impact: "high", mitigation: "Escalate weekly", status: "open", relatedWorkstreamId: "ws-1", relatedMilestoneId: "ms-1" });
  file.assumptions.push({ id: "as-1", title: "Funding approved", description: "Budget remains available.", owner: "Ada", validationDate: "2026-06-30", status: "invalidated", relatedWorkstreamId: "ws-1" });
  file.issues.push({ id: "i-1", title: "Production outage", description: "Critical service unavailable.", owner: "Lin", severity: "critical", status: "open", targetResolutionDate: "2026-06-21", relatedWorkstreamId: "ws-1", relatedMilestoneId: "ms-1" });
  return file;
}

test("rejects invalid JSON and invalid .pmgov schema", () => {
  assert.equal(parsePmgovJson("{").success, false);
  const invalid = validatePmgovFile({ schemaVersion: "1.0.0" });
  assert.equal(invalid.success, false);
  assert.match(invalid.error, /Invalid \.pmgov file/);
});

test("save/open lifecycle serializes, validates, and updates metadata", () => {
  const file = fixture();
  const prepared = preparePmgovForSave(file);
  const serialized = serializePmgovFile(prepared);
  const reopened = parsePmgovJson(serialized);
  assert.equal(reopened.success, true);
  if (reopened.success) {
    assert.equal(reopened.data.project.name, "QA Project");
    assert.equal(reopened.data.fileMetadata.createdByAppVersion, "0.1.0");
  }
});

test("milestone variance describes late, early, and missing comparison dates", () => {
  assert.equal(formatMilestoneVariance({ plannedDate: "2026-06-20", forecastDate: "2026-06-23" }), "3 days late");
  assert.equal(formatMilestoneVariance({ plannedDate: "2026-06-20", actualDate: "2026-06-19" }), "1 day early");
  assert.equal(formatMilestoneVariance({ plannedDate: "2026-06-20" }), "No forecast/actual date");
});

test("dashboard attention logic flags status, variance, due-soon, and overdue reasons", () => {
  const reasons = getMilestoneAttentionReasons({ id: "m", stageId: "s", name: "M", plannedDate: "2026-06-15", forecastDate: "2026-06-25", status: "red" }, "2026-06-20");
  assert.deepEqual(reasons, ["red status", "forecast is later than planned", "forecast date is due within 30 days", "planned date is in the past"]);
});

test("executive report Markdown includes attention, actions, decisions, and empty-safe sections", () => {
  const markdown = buildExecutiveReportMarkdown(fixture(), "2026-06-20 10:00", "2026-06-20");
  assert.match(markdown, /^# Executive Status Report — QA Project/);
  assert.match(markdown, /Pilot \(Delivery \/ Build\): amber status; forecast is later than planned/);
  assert.match(markdown, /Confirm launch owner/);
  assert.match(markdown, /Use local files/);
  assert.match(markdown, /RAID Summary/);
  assert.match(markdown, /Top Risks/);
  assert.match(markdown, /Open Issues/);
  assert.match(markdown, /Vendor delay/);
  assert.match(markdown, /Production outage/);
  assert.match(markdown, /Dependency Summary/);
  assert.match(markdown, /Blocked Dependencies/);
  assert.match(markdown, /API contract/);
});


test("automated health calculates project and workstream status with manual override support", () => {
  const file = fixture();
  const workstreamHealth = calculateWorkstreamHealth(file, file.workstreams[0], "2026-06-20");
  assert.equal(workstreamHealth.status, "red");
  assert.match(workstreamHealth.reasons.join("; "), /API contract/);

  const projectHealth = calculateProjectHealth(file, "2026-06-20");
  assert.equal(projectHealth.status, "red");
  assert.match(projectHealth.reasons.join("; "), /API contract|Delivery/);

  file.project.healthMode = "manual";
  file.project.status = "red";
  const overriddenProjectHealth = calculateProjectHealth(file, "2026-06-20");
  assert.equal(overriddenProjectHealth.status, "red");
  assert.equal(overriddenProjectHealth.calculatedStatus, "red");
  assert.equal(overriddenProjectHealth.mode, "manual");
});


test("existing files without dependencies or RAID records remain valid and default to empty lists", () => {
  const file = fixture();
  const legacy = JSON.parse(serializePmgovFile(file));
  delete legacy.dependencies;
  delete legacy.risks;
  delete legacy.assumptions;
  delete legacy.issues;
  const parsed = validatePmgovFile(legacy);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data.dependencies, []);
    assert.deepEqual(parsed.data.risks, []);
    assert.deepEqual(parsed.data.assumptions, []);
    assert.deepEqual(parsed.data.issues, []);
  }
});


test("portfolio files persist multiple project workspaces and executive reports", () => {
  const file = fixture();
  const activeProject = getActiveProjectWorkspace(file);
  assert.equal(activeProject.name, "QA Project");
  const second = structuredClone(activeProject);
  second.id = "project-2";
  second.name = "Second Project";
  second.status = "green";
  second.workstreams = [];
  second.stages = [];
  second.milestones = [];
  second.actions = [];
  second.dependencies = [];
  second.risks = [];
  second.assumptions = [];
  second.issues = [];
  file.projects.push(second);
  const health = calculatePortfolioHealth(file, "2026-06-20");
  assert.equal(health.status, "red");
  const report = buildPortfolioExecutiveReportMarkdown(file, "2026-06-20 10:00", "2026-06-20");
  assert.match(report, /^# Portfolio Executive Report — Untitled Portfolio/);
  assert.match(report, /Project Summary/);
  assert.match(report, /Vendor delay/);
  assert.match(report, /Production outage/);
  assert.match(report, /API contract/);
});


test("old single-project files migrate to one-project portfolios with all records", () => {
  const file = fixture();
  const legacy = JSON.parse(serializePmgovFile(file));
  delete legacy.portfolio;
  delete legacy.activeProjectId;
  delete legacy.projects;

  const parsed = validatePmgovFile(legacy);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.migratedFromLegacy, true);
    assert.equal(parsed.data.projects.length, 1);
    assert.equal(parsed.data.activeProjectId, legacy.project.id);
    assert.equal(parsed.data.project.name, "QA Project");
    assert.equal(parsed.data.workstreams.length, 1);
    assert.equal(parsed.data.stages.length, 1);
    assert.equal(parsed.data.milestones.length, 1);
    assert.equal(parsed.data.notes.length, 0);
    assert.equal(parsed.data.actions.length, 1);
    assert.equal(parsed.data.decisions.length, 1);
    assert.equal(parsed.data.dependencies.length, 1);
    assert.equal(parsed.data.risks.length, 1);
    assert.equal(parsed.data.assumptions.length, 1);
    assert.equal(parsed.data.issues.length, 1);
  }
});

test("save upgraded file and reopen portfolio format without migration", () => {
  const legacy = JSON.parse(serializePmgovFile(fixture()));
  delete legacy.portfolio;
  delete legacy.activeProjectId;
  delete legacy.projects;

  const migrated = validatePmgovFile(legacy);
  assert.equal(migrated.success, true);
  if (migrated.success) {
    const saved = serializePmgovFile(preparePmgovForSave(migrated.data));
    const reopened = parsePmgovJson(saved);
    assert.equal(reopened.success, true);
    if (reopened.success) {
      assert.equal(reopened.migratedFromLegacy, false);
      assert.equal(reopened.data.projects.length, 1);
      assert.equal(reopened.data.projects[0].workstreams[0].name, "Delivery");
      assert.equal(reopened.data.projects[0].risks[0].title, "Vendor delay");
    }
  }
});

test("multiple projects remain isolated and project switching preserves data", () => {
  const file = fixture();
  const firstId = file.activeProjectId;
  const second = structuredClone(file.projects[0]);
  second.id = "project-2";
  second.name = "Second Project";
  second.workstreams = [{ id: "ws-2", name: "Second Delivery", status: "green", sortOrder: 1 }];
  second.stages = [];
  second.milestones = [];
  second.actions = [];
  second.decisions = [];
  second.dependencies = [];
  second.risks = [];
  second.assumptions = [];
  second.issues = [];
  file.projects.push(second);

  file.project.name = "First Project Edited";
  file.workstreams[0].name = "First Delivery Edited";
  const onSecond = switchActiveProjectWorkspace(file, "project-2");
  assert.equal(onSecond.project.name, "Second Project");
  assert.equal(onSecond.workstreams[0].name, "Second Delivery");

  onSecond.project.name = "Second Project Edited";
  onSecond.workstreams[0].name = "Second Delivery Edited";
  const backOnFirst = switchActiveProjectWorkspace(onSecond, firstId);
  assert.equal(backOnFirst.project.name, "First Project Edited");
  assert.equal(backOnFirst.workstreams[0].name, "First Delivery Edited");

  const saved = preparePmgovForSave(backOnFirst);
  assert.equal(saved.projects.find((project) => project.id === firstId)?.workstreams[0].name, "First Delivery Edited");
  assert.equal(saved.projects.find((project) => project.id === "project-2")?.workstreams[0].name, "Second Delivery Edited");
});

test("last project cannot be deleted", () => {
  const file = fixture();
  assert.throws(() => deletePortfolioProject(file, file.activeProjectId), /last remaining project cannot be deleted/i);
});
