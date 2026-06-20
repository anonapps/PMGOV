import { z } from "zod";
import type { ActionItem, PmgovFile, RagStatus, Workstream } from "@/types/pmgov";

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
const healthModeSchema = z.enum(["auto", "manual"]);

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
    healthMode: healthModeSchema.optional(),
    executiveSummary: z.string().optional(),
  }),
  workstreams: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      status: workstreamStatusSchema,
      healthMode: healthModeSchema.optional(),
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
      healthMode: "auto",
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

export type CalculatedHealth = {
  status: RagStatus;
  mode: "auto" | "manual";
  reasons: string[];
  calculatedStatus: RagStatus;
  manualStatus?: RagStatus;
};

function isOpenAction(action: ActionItem) {
  return action.status !== "completed" && action.status !== "cancelled";
}

function isCriticalAction(action: ActionItem) {
  return /\bcritical\b/i.test(action.commentary ?? "") || /\bcritical\b/i.test(action.description);
}

function actionHealthReasons(actions: ActionItem[], today: string) {
  const redReasons: string[] = [];
  const amberReasons: string[] = [];

  actions.filter(isOpenAction).forEach((action) => {
    const daysUntilDue = daysBetween(today, action.dueDate);
    if (daysUntilDue !== null && daysUntilDue < 0) {
      const label = `Action "${action.description}" is ${formatDateDistance(daysUntilDue)}`;
      if (isCriticalAction(action)) {
        redReasons.push(`${label} and marked critical`);
      } else {
        amberReasons.push(label);
      }
    }
  });

  return { redReasons, amberReasons };
}

export function calculateWorkstreamHealth(file: PmgovFile, workstream: Workstream, today: string): CalculatedHealth {
  const stages = file.stages.filter((stage) => stage.workstreamId === workstream.id);
  const stageIds = new Set(stages.map((stage) => stage.id));
  const milestones = file.milestones.filter((milestone) => stageIds.has(milestone.stageId));
  const milestoneIds = new Set(milestones.map((milestone) => milestone.id));
  const linkedActionIds = new Set(
    file.links
      .filter((link) => link.sourceType === "action" && ((link.targetType === "workstream" && link.targetId === workstream.id) || (link.targetType === "stage" && stageIds.has(link.targetId)) || (link.targetType === "milestone" && milestoneIds.has(link.targetId))))
      .map((link) => link.sourceId),
  );
  const actions = file.actions.filter((action) => linkedActionIds.has(action.id));
  const redReasons: string[] = [];
  const amberReasons: string[] = [];

  milestones.forEach((milestone) => {
    const isComplete = milestone.status === "complete";
    const plannedDistance = daysBetween(today, milestone.plannedDate);
    const forecastVariance = daysBetween(milestone.plannedDate, milestone.forecastDate);

    if (!isComplete && plannedDistance !== null && plannedDistance < 0) redReasons.push(`Milestone "${milestone.name}" is overdue`);
    if (milestone.status === "red") redReasons.push(`Milestone "${milestone.name}" is red`);
    if (milestone.status === "amber") amberReasons.push(`Milestone "${milestone.name}" is amber`);
    if (!isComplete && plannedDistance !== null && plannedDistance >= 0 && plannedDistance <= 30) amberReasons.push(`Milestone "${milestone.name}" is due within 30 days`);
    if (forecastVariance !== null && forecastVariance > 0) amberReasons.push(`Milestone "${milestone.name}" forecast is later than planned`);
  });

  const actionReasons = actionHealthReasons(actions, today);
  redReasons.push(...actionReasons.redReasons);
  amberReasons.push(...actionReasons.amberReasons);

  const calculatedStatus = redReasons.length > 0 ? "red" : amberReasons.length > 0 ? "amber" : milestones.length > 0 || actions.length > 0 ? "green" : "not_set";
  const mode = workstream.healthMode ?? "auto";
  const manualStatus = workstream.status === "complete" ? "green" : workstream.status;

  return {
    status: mode === "manual" ? manualStatus : calculatedStatus,
    mode,
    calculatedStatus,
    manualStatus: mode === "manual" ? manualStatus : undefined,
    reasons: redReasons.length > 0 ? redReasons : amberReasons.length > 0 ? amberReasons : calculatedStatus === "green" ? ["No overdue milestones, overdue open actions, red milestones, or amber milestones found for this workstream."] : ["No milestones or linked actions are available to calculate workstream health."],
  };
}

export function calculateProjectHealth(file: PmgovFile, today: string): CalculatedHealth {
  const workstreamHealth = file.workstreams.map((workstream) => ({ workstream, health: calculateWorkstreamHealth(file, workstream, today) }));
  const redReasons: string[] = [];
  const amberReasons: string[] = [];

  workstreamHealth.forEach(({ workstream, health }) => {
    if (health.status === "red") redReasons.push(`Workstream "${workstream.name}" is red`);
    if (health.status === "amber") amberReasons.push(`Workstream "${workstream.name}" is amber`);
  });

  file.milestones.forEach((milestone) => {
    const isComplete = milestone.status === "complete";
    const plannedDistance = daysBetween(today, milestone.plannedDate);
    const forecastVariance = daysBetween(milestone.plannedDate, milestone.forecastDate);

    if (!isComplete && plannedDistance !== null && plannedDistance < 0) redReasons.push(`Milestone "${milestone.name}" is overdue`);
    if (milestone.status === "red") redReasons.push(`Milestone "${milestone.name}" is red`);
    if (milestone.status === "amber") amberReasons.push(`Milestone "${milestone.name}" is amber`);
    if (!isComplete && plannedDistance !== null && plannedDistance >= 0 && plannedDistance <= 30) amberReasons.push(`Milestone "${milestone.name}" is due within 30 days`);
    if (forecastVariance !== null && forecastVariance > 0) amberReasons.push(`Milestone "${milestone.name}" forecast is later than planned`);
  });

  const actionReasons = actionHealthReasons(file.actions, today);
  redReasons.push(...actionReasons.redReasons);
  amberReasons.push(...actionReasons.amberReasons);

  const calculatedStatus = redReasons.length > 0 ? "red" : amberReasons.length > 0 ? "amber" : "green";
  const mode = file.project.healthMode ?? "auto";

  return {
    status: mode === "manual" ? file.project.status : calculatedStatus,
    mode,
    calculatedStatus,
    manualStatus: mode === "manual" ? file.project.status : undefined,
    reasons: redReasons.length > 0 ? redReasons : amberReasons.length > 0 ? amberReasons : ["No overdue milestones, overdue open actions, red workstreams, red milestones, amber workstreams, or amber milestones found."],
  };
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
  const projectHealth = calculateProjectHealth(file, today);
  const workstreamItems = file.workstreams.map((workstream) => {
    const health = calculateWorkstreamHealth(file, workstream, today);
    return `${workstream.name}: ${statusLabel(health.status)} (${statusLabel(health.mode)}${health.mode === "manual" ? ` override; auto would be ${statusLabel(health.calculatedStatus)}` : ""}) — ${health.reasons.join("; ")}${workstream.commentary ? ` — ${workstream.commentary}` : ""}`;
  });
  const actionItems = file.actions
    .filter((action) => action.status !== "completed" && action.status !== "cancelled")
    .map((action) => `${action.description} — Owner: ${action.owner || "Unassigned"}; Due: ${action.dueDate ? `${action.dueDate} (${formatDateDistance(daysBetween(today, action.dueDate))})` : "No due date"}; Status: ${statusLabel(action.status)}.`);
  const decisionItems = [...file.decisions]
    .sort((a, b) => b.decisionDate.localeCompare(a.decisionDate))
    .slice(0, 8)
    .map((decision) => `${decision.decisionDate}: ${decision.title}${decision.decisionMaker ? ` — ${decision.decisionMaker}` : ""}. ${decision.decisionText}`);

  return `# Executive Status Report — ${file.project.name}\n\nGenerated: ${generatedAt}\n\n## Project Overview\n${file.project.description || "No project description captured."}\n\nSponsor: ${file.project.sponsor || "Not set"}\nProject Manager: ${file.project.projectManager || "Not set"}\nStart Date: ${file.project.startDate || "Not set"}\nTarget Date: ${file.project.targetDate || "Not set"}\n\n## Overall Status\nProject health: ${statusLabel(projectHealth.status)} (${statusLabel(projectHealth.mode)}${projectHealth.mode === "manual" ? ` override; auto would be ${statusLabel(projectHealth.calculatedStatus)}` : ""})
Health reasons: ${projectHealth.reasons.join("; ")}\n\n## Key Risks / Attention Items\n${lineItems(attentionItems, "No milestones requiring attention.")}\n\n## Milestone Outlook\n${lineItems(upcomingItems, "No upcoming milestones captured.")}\n\n## Workstream Health\n${lineItems(workstreamItems, "No workstreams captured.")}\n\n## Open Actions\n${lineItems(actionItems, "No open actions captured.")}\n\n## Recent Decisions\n${lineItems(decisionItems, "No recent decisions captured.")}\n\n## Executive Summary\n${file.project.executiveSummary || "No executive summary has been entered for this project."}\n`;
}
