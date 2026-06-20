import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExecutiveReportMarkdown,
  calculateProjectHealth,
  calculateWorkstreamHealth,
  createEmptyProjectFile,
  formatMilestoneVariance,
  getMilestoneAttentionReasons,
  parsePmgovJson,
  preparePmgovForSave,
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
