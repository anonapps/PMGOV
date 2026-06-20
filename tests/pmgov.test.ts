import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExecutiveReportMarkdown,
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
  file.decisions.push({ id: "d-1", title: "Use local files", decisionText: "No backend for MVP.", decisionDate: "2026-06-10" });
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
});
