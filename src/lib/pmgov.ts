import { z } from "zod";
import type { PmgovFile } from "@/types/pmgov";

export const APP_VERSION = "0.1.0";
export const CURRENT_SCHEMA_VERSION = "1.0.0";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = z.string().regex(isoDateRegex, "Expected an ISO date in YYYY-MM-DD format");
const isoDateTime = z.string().datetime({ message: "Expected an ISO date-time string" });

const ragStatusSchema = z.enum(["green", "amber", "red", "not_set"]);
const workstreamStatusSchema = z.enum(["green", "amber", "red", "not_set", "complete"]);
const stageStatusSchema = z.enum(["not_started", "in_progress", "complete", "blocked"]);
const milestoneStatusSchema = z.enum(["green", "amber", "red", "not_set", "complete"]);
const actionStatusSchema = z.enum(["open", "in_progress", "completed", "cancelled"]);
const noteTypeSchema = z.enum(["meeting", "workshop", "general"]);
const impactLevelSchema = z.enum(["low", "medium", "high", "critical", "not_set"]);
const entityTypeSchema = z.enum(["note", "decision", "action", "milestone", "workstream", "stage"]);
const reportTypeSchema = z.enum(["status", "steering_committee", "executive"]);

export const pmgovFileSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  fileMetadata: z.object({
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
    createdByAppVersion: z.string().optional(),
  }),
  project: z.object({
    id: z.string().min(1),
    name: z.string().min(1, "Project name is required"),
    description: z.string().optional(),
    sponsor: z.string().optional(),
    projectManager: z.string().min(1, "Project manager is required"),
    startDate: isoDate.optional(),
    targetDate: isoDate.optional(),
    status: ragStatusSchema,
    executiveSummary: z.string().optional(),
  }),
  workstreams: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      status: workstreamStatusSchema,
      commentary: z.string().optional(),
      sortOrder: z.number(),
    }),
  ),
  stages: z.array(
    z.object({
      id: z.string().min(1),
      workstreamId: z.string().min(1),
      name: z.string().min(1),
      status: stageStatusSchema.optional(),
      commentary: z.string().optional(),
      sortOrder: z.number(),
    }),
  ),
  milestones: z.array(
    z.object({
      id: z.string().min(1),
      stageId: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      plannedDate: isoDate,
      forecastDate: isoDate.optional(),
      actualDate: isoDate.optional(),
      status: milestoneStatusSchema,
      commentary: z.string().optional(),
    }),
  ),
  notes: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      type: noteTypeSchema,
      date: isoDate,
      content: z.string(),
      tags: z.array(z.string()).optional(),
      createdAt: isoDateTime,
      updatedAt: isoDateTime,
    }),
  ),
  decisions: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      context: z.string().optional(),
      decisionText: z.string(),
      decisionMaker: z.string().optional(),
      decisionDate: isoDate,
      impact: impactLevelSchema.optional(),
      evidenceLinks: z.array(z.string()).optional(),
    }),
  ),
  actions: z.array(
    z.object({
      id: z.string().min(1),
      description: z.string(),
      owner: z.string(),
      dueDate: isoDate.optional(),
      status: actionStatusSchema,
      commentary: z.string().optional(),
    }),
  ),
  links: z.array(
    z.object({
      id: z.string().min(1),
      sourceType: entityTypeSchema,
      sourceId: z.string().min(1),
      targetType: entityTypeSchema,
      targetId: z.string().min(1),
      relationship: z.string().optional(),
    }),
  ),
  reports: z.array(
    z.object({
      id: z.string().min(1),
      type: reportTypeSchema,
      title: z.string().min(1),
      generatedAt: isoDateTime,
      content: z.string(),
    }),
  ),
});

export type ValidationResult =
  | { success: true; data: PmgovFile }
  | { success: false; error: string };

export function createEmptyProjectFile(): PmgovFile {
  const now = new Date().toISOString();

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    fileMetadata: {
      createdAt: now,
      updatedAt: now,
      createdByAppVersion: APP_VERSION,
    },
    project: {
      id: crypto.randomUUID(),
      name: "Untitled Project",
      projectManager: "Project Manager",
      status: "not_set",
      description: "",
      sponsor: "",
      executiveSummary: "",
    },
    workstreams: [],
    stages: [],
    milestones: [],
    notes: [],
    decisions: [],
    actions: [],
    links: [],
    reports: [],
  };
}

export function validatePmgovFile(value: unknown): ValidationResult {
  const result = pmgovFileSchema.safeParse(value);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const message = result.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "file"}: ${issue.message}`)
    .join("; ");

  return {
    success: false,
    error: `Invalid .pmgov file. ${message}`,
  };
}

export function parsePmgovJson(text: string): ValidationResult {
  try {
    return validatePmgovFile(JSON.parse(text));
  } catch {
    return { success: false, error: "Invalid .pmgov file. The file is not valid JSON." };
  }
}

export function preparePmgovForSave(file: PmgovFile): PmgovFile {
  return {
    ...file,
    fileMetadata: {
      ...file.fileMetadata,
      updatedAt: new Date().toISOString(),
      createdByAppVersion: file.fileMetadata.createdByAppVersion ?? APP_VERSION,
    },
  };
}

export function serializePmgovFile(file: PmgovFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function buildPmgovFilename(projectName: string): string {
  const safeName = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "project";

  return `${safeName}.pmgov`;
}

export function daysBetween(startDate: string, endDate?: string) {
  if (!endDate) {
    return null;
  }

  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }

  return Math.round((end - start) / 86_400_000);
}

export function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function formatDateDistance(days: number | null) {
  if (days === null) return "No date";
  if (days === 0) return "Today";
  return days > 0 ? `In ${days} day${days === 1 ? "" : "s"}` : `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
}

export function formatMilestoneVariance(milestone: Pick<PmgovFile["milestones"][number], "plannedDate" | "forecastDate" | "actualDate">) {
  const comparisonDate = milestone.actualDate || milestone.forecastDate;
  const variance = daysBetween(milestone.plannedDate, comparisonDate);

  if (variance === null) return "No forecast/actual date";
  if (variance === 0) return "On plan";
  return `${Math.abs(variance)} day${Math.abs(variance) === 1 ? "" : "s"} ${variance > 0 ? "late" : "early"}`;
}

export function getMilestoneAttentionReasons(milestone: PmgovFile["milestones"][number], today: string) {
  const reasons: string[] = [];
  const daysUntilPlanned = daysBetween(today, milestone.plannedDate);
  const daysUntilForecast = daysBetween(today, milestone.forecastDate);
  const forecastVariance = daysBetween(milestone.plannedDate, milestone.forecastDate);
  const isComplete = milestone.status === "complete";

  if (milestone.status === "amber" || milestone.status === "red") reasons.push(`${statusLabel(milestone.status)} status`);
  if (forecastVariance !== null && forecastVariance > 0) reasons.push("forecast is later than planned");
  if (!isComplete && daysUntilPlanned !== null && daysUntilPlanned >= 0 && daysUntilPlanned <= 30) reasons.push("planned date is due within 30 days");
  if (!isComplete && daysUntilForecast !== null && daysUntilForecast >= 0 && daysUntilForecast <= 30) reasons.push("forecast date is due within 30 days");
  if (!isComplete && daysUntilPlanned !== null && daysUntilPlanned < 0) reasons.push("planned date is in the past");
  if (!isComplete && daysUntilForecast !== null && daysUntilForecast < 0) reasons.push("forecast date is in the past");

  return reasons;
}

export function buildExecutiveReportMarkdown(file: PmgovFile, generatedAt: string, today: string) {
  const lineItems = (items: string[], emptyText: string) => (items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : emptyText);
  const milestoneContext = (stageId: string) => {
    const stage = file.stages.find((item) => item.id === stageId);
    const workstream = stage ? file.workstreams.find((item) => item.id === stage.workstreamId) : undefined;
    return { stage, workstream };
  };
  const attentionItems = file.milestones
    .map((milestone) => ({ milestone, ...milestoneContext(milestone.stageId), reasons: getMilestoneAttentionReasons(milestone, today), daysUntilPlanned: daysBetween(today, milestone.plannedDate) }))
    .filter((item) => item.reasons.length > 0)
    .sort((a, b) => (a.daysUntilPlanned ?? Number.MAX_SAFE_INTEGER) - (b.daysUntilPlanned ?? Number.MAX_SAFE_INTEGER))
    .map(({ milestone, workstream, stage, reasons }) => `${milestone.name} (${workstream?.name ?? "Unassigned workstream"} / ${stage?.name ?? "Unassigned stage"}): ${reasons.join("; ")}.`);
  const upcomingItems = file.milestones
    .filter((milestone) => milestone.status !== "complete")
    .map((milestone) => ({ milestone, ...milestoneContext(milestone.stageId), daysUntilPlanned: daysBetween(today, milestone.plannedDate) }))
    .filter((item) => item.daysUntilPlanned !== null && item.daysUntilPlanned >= 0)
    .sort((a, b) => (a.daysUntilPlanned ?? Number.MAX_SAFE_INTEGER) - (b.daysUntilPlanned ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 8)
    .map(({ milestone, workstream, daysUntilPlanned }) => `${milestone.plannedDate} (${formatDateDistance(daysUntilPlanned)}): ${milestone.name} — ${workstream?.name ?? "Unassigned workstream"}.`);
  const workstreamItems = file.workstreams.map((workstream) => `${workstream.name}: ${statusLabel(workstream.status)}${workstream.commentary ? ` — ${workstream.commentary}` : ""}`);
  const actionItems = file.actions
    .filter((action) => action.status !== "completed" && action.status !== "cancelled")
    .map((action) => `${action.description} — Owner: ${action.owner || "Unassigned"}; Due: ${action.dueDate ? `${action.dueDate} (${formatDateDistance(daysBetween(today, action.dueDate))})` : "No due date"}; Status: ${statusLabel(action.status)}.`);
  const decisionItems = [...file.decisions]
    .sort((a, b) => b.decisionDate.localeCompare(a.decisionDate))
    .slice(0, 8)
    .map((decision) => `${decision.decisionDate}: ${decision.title}${decision.decisionMaker ? ` — ${decision.decisionMaker}` : ""}. ${decision.decisionText}`);

  return `# Executive Status Report — ${file.project.name}\n\nGenerated: ${generatedAt}\n\n## Project Overview\n${file.project.description || "No project description captured."}\n\nSponsor: ${file.project.sponsor || "Not set"}\nProject Manager: ${file.project.projectManager || "Not set"}\nStart Date: ${file.project.startDate || "Not set"}\nTarget Date: ${file.project.targetDate || "Not set"}\n\n## Overall Status\nProject status: ${statusLabel(file.project.status)}\n\n## Key Risks / Attention Items\n${lineItems(attentionItems, "No milestones requiring attention.")}\n\n## Milestone Outlook\n${lineItems(upcomingItems, "No upcoming milestones captured.")}\n\n## Workstream Health\n${lineItems(workstreamItems, "No workstreams captured.")}\n\n## Open Actions\n${lineItems(actionItems, "No open actions captured.")}\n\n## Recent Decisions\n${lineItems(decisionItems, "No recent decisions captured.")}\n\n## Executive Summary\n${file.project.executiveSummary || "No executive summary has been entered for this project."}\n`;
}
