import { z } from "zod";
import type { ActionItem, Dependency, LegacyPmgovFile, PmgovFile, PortfolioProject, RagStatus, Workstream } from "@/types/pmgov";

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
const dependencyStatusSchema = z.enum(["open", "in_progress", "resolved", "blocked"]);
const raidLevelSchema = z.enum(["low", "medium", "high"]);
const riskStatusSchema = z.enum(["open", "monitoring", "mitigated", "closed"]);
const assumptionStatusSchema = z.enum(["active", "validated", "invalidated"]);
const issueSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
const issueStatusSchema = z.enum(["open", "investigating", "resolved", "closed"]);
const noteTypeSchema = z.enum(["meeting", "workshop", "general"]);
const impactLevelSchema = z.enum(["low", "medium", "high", "critical", "not_set"]);
const entityTypeSchema = z.enum(["note", "decision", "action", "milestone", "workstream", "stage"]);
const reportTypeSchema = z.enum(["status", "steering_committee", "executive", "portfolio_executive"]);
const healthModeSchema = z.enum(["auto", "manual"]);

const projectSchema = z.object({
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
});

const workstreamSchema = z.object({ id: z.string().min(1), name: z.string().min(1), description: z.string().optional(), status: workstreamStatusSchema, healthMode: healthModeSchema.optional(), commentary: z.string().optional(), sortOrder: z.number() });
const stageSchema = z.object({ id: z.string().min(1), workstreamId: z.string().min(1), name: z.string().min(1), status: stageStatusSchema.optional(), commentary: z.string().optional(), sortOrder: z.number() });
const milestoneSchema = z.object({ id: z.string().min(1), stageId: z.string().min(1), name: z.string().min(1), description: z.string().optional(), plannedDate: isoDate, forecastDate: isoDate.optional(), actualDate: isoDate.optional(), status: milestoneStatusSchema, commentary: z.string().optional() });
const noteSchema = z.object({ id: z.string().min(1), title: z.string().min(1), type: noteTypeSchema, date: isoDate, content: z.string(), tags: z.array(z.string()).optional(), createdAt: isoDateTime, updatedAt: isoDateTime });
const decisionSchema = z.object({ id: z.string().min(1), title: z.string().min(1), context: z.string().optional(), decisionText: z.string(), decisionMaker: z.string().optional(), decisionDate: isoDate, impact: impactLevelSchema.optional(), evidenceLinks: z.array(z.string()).optional() });
const actionSchema = z.object({ id: z.string().min(1), description: z.string(), owner: z.string(), dueDate: isoDate.optional(), status: actionStatusSchema, commentary: z.string().optional() });
const dependencySchema = z.object({ id: z.string().min(1), title: z.string().min(1), description: z.string(), sourceWorkstreamId: z.string().min(1), sourceMilestoneId: z.string().optional(), targetWorkstreamId: z.string().min(1), targetMilestoneId: z.string().optional(), owner: z.string(), dueDate: isoDate, status: dependencyStatusSchema, commentary: z.string().optional() });
const riskSchema = z.object({ id: z.string().min(1), title: z.string().min(1), description: z.string(), owner: z.string(), probability: raidLevelSchema, impact: raidLevelSchema, mitigation: z.string(), status: riskStatusSchema, relatedWorkstreamId: z.string().optional(), relatedMilestoneId: z.string().optional() });
const assumptionSchema = z.object({ id: z.string().min(1), title: z.string().min(1), description: z.string(), owner: z.string(), validationDate: isoDate, status: assumptionStatusSchema, relatedWorkstreamId: z.string().optional() });
const issueSchema = z.object({ id: z.string().min(1), title: z.string().min(1), description: z.string(), owner: z.string(), severity: issueSeveritySchema, status: issueStatusSchema, targetResolutionDate: isoDate, relatedWorkstreamId: z.string().optional(), relatedMilestoneId: z.string().optional() });
const linkSchema = z.object({ id: z.string().min(1), sourceType: entityTypeSchema, sourceId: z.string().min(1), targetType: entityTypeSchema, targetId: z.string().min(1), relationship: z.string().optional() });
const reportSchema = z.object({ id: z.string().min(1), type: reportTypeSchema, title: z.string().min(1), generatedAt: isoDateTime, content: z.string() });

const projectWorkspaceSchema = projectSchema.extend({
  workstreams: z.array(workstreamSchema).default([]), stages: z.array(stageSchema).default([]), milestones: z.array(milestoneSchema).default([]), notes: z.array(noteSchema).default([]), decisions: z.array(decisionSchema).default([]), actions: z.array(actionSchema).default([]), dependencies: z.array(dependencySchema).default([]), risks: z.array(riskSchema).default([]), assumptions: z.array(assumptionSchema).default([]), issues: z.array(issueSchema).default([]), links: z.array(linkSchema).default([]), reports: z.array(reportSchema).default([]),
});

export const legacyPmgovFileSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION), fileMetadata: z.object({ createdAt: isoDateTime, updatedAt: isoDateTime, createdByAppVersion: z.string().optional() }), project: projectSchema,
  workstreams: z.array(workstreamSchema), stages: z.array(stageSchema), milestones: z.array(milestoneSchema), notes: z.array(noteSchema), decisions: z.array(decisionSchema), actions: z.array(actionSchema), dependencies: z.array(dependencySchema).default([]), risks: z.array(riskSchema).default([]), assumptions: z.array(assumptionSchema).default([]), issues: z.array(issueSchema).default([]), links: z.array(linkSchema), reports: z.array(reportSchema),
});

export const pmgovFileSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  fileMetadata: z.object({ createdAt: isoDateTime, updatedAt: isoDateTime, createdByAppVersion: z.string().optional() }),
  portfolio: z.object({ name: z.string().min(1), description: z.string().optional(), sponsor: z.string().optional(), portfolioManager: z.string().optional() }),
  activeProjectId: z.string().min(1),
  projects: z.array(projectWorkspaceSchema).min(1),
}).and(legacyPmgovFileSchema).superRefine((file, ctx) => {
  if (!file.projects.some((project) => project.id === file.activeProjectId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["activeProjectId"], message: "Active project must exist in projects" });
});

export type ValidationResult =
  | { success: true; data: PmgovFile; migratedFromLegacy: boolean }
  | { success: false; error: string };

function emptyPortfolioProject(): PortfolioProject {
  return {
    id: crypto.randomUUID(),
    name: "Untitled Project",
    projectManager: "Project Manager",
    status: "not_set",
    healthMode: "auto",
    description: "",
    sponsor: "",
    executiveSummary: "",
    workstreams: [], stages: [], milestones: [], notes: [], decisions: [], actions: [], dependencies: [], risks: [], assumptions: [], issues: [], links: [], reports: [],
  };
}

export function projectWorkspaceToLegacyFile(file: PmgovFile, project: PortfolioProject): LegacyPmgovFile {
  const { workstreams, stages, milestones, notes, decisions, actions, dependencies, risks, assumptions, issues, links, reports, ...projectFields } = project;
  return { schemaVersion: file.schemaVersion, fileMetadata: file.fileMetadata, project: projectFields, workstreams, stages, milestones, notes, decisions, actions, dependencies, risks, assumptions, issues, links, reports };
}

export function getActiveProjectWorkspace(file: PmgovFile): PortfolioProject {
  const project = file.projects.find((item) => item.id === file.activeProjectId) ?? file.projects[0];
  return { ...project, ...file.project, workstreams: file.workstreams, stages: file.stages, milestones: file.milestones, notes: file.notes, decisions: file.decisions, actions: file.actions, dependencies: file.dependencies, risks: file.risks, assumptions: file.assumptions, issues: file.issues, links: file.links, reports: file.reports };
}

export function getActiveProjectFile(file: PmgovFile): LegacyPmgovFile {
  return projectWorkspaceToLegacyFile(file, getActiveProjectWorkspace(file));
}

export function replaceActiveProjectFromFile(file: PmgovFile, activeFile: LegacyPmgovFile): PmgovFile {
  const project: PortfolioProject = { ...activeFile.project, workstreams: activeFile.workstreams, stages: activeFile.stages, milestones: activeFile.milestones, notes: activeFile.notes, decisions: activeFile.decisions, actions: activeFile.actions, dependencies: activeFile.dependencies, risks: activeFile.risks, assumptions: activeFile.assumptions, issues: activeFile.issues, links: activeFile.links, reports: activeFile.reports };
  const existingIndex = file.projects.findIndex((item) => item.id === project.id);
  const projects = existingIndex >= 0 ? file.projects.map((item) => (item.id === project.id ? project : item)) : [...file.projects, project];
  return { ...file, ...activeFile, activeProjectId: project.id, projects };
}

export function syncActiveProjectToPortfolio(file: PmgovFile): PmgovFile {
  return replaceActiveProjectFromFile(file, getActiveProjectFile(file));
}

export function switchActiveProjectWorkspace(file: PmgovFile, projectId: string): PmgovFile {
  const synced = syncActiveProjectToPortfolio(file);
  const project = synced.projects.find((item) => item.id === projectId) ?? synced.projects[0];
  return { ...synced, ...projectWorkspaceToLegacyFile(synced, project), activeProjectId: project.id };
}

export function deletePortfolioProject(file: PmgovFile, projectId: string): PmgovFile {
  const synced = syncActiveProjectToPortfolio(file);
  if (synced.projects.length <= 1) {
    throw new Error("The last remaining project cannot be deleted.");
  }

  const remainingProjects = synced.projects.filter((project) => project.id !== projectId);
  if (remainingProjects.length === synced.projects.length) {
    return synced;
  }

  const nextActiveProjectId = synced.activeProjectId === projectId ? remainingProjects[0].id : synced.activeProjectId;
  return switchActiveProjectWorkspace({ ...synced, projects: remainingProjects, activeProjectId: nextActiveProjectId }, nextActiveProjectId);
}

export function legacyFileToPortfolio(file: LegacyPmgovFile): PmgovFile {
  const project: PortfolioProject = { ...file.project, workstreams: file.workstreams, stages: file.stages, milestones: file.milestones, notes: file.notes, decisions: file.decisions, actions: file.actions, dependencies: file.dependencies, risks: file.risks, assumptions: file.assumptions, issues: file.issues, links: file.links, reports: file.reports };
  return {
    ...file,
    portfolio: { name: `${file.project.name} Portfolio`, description: file.project.description ?? "", sponsor: file.project.sponsor ?? "", portfolioManager: file.project.projectManager },
    activeProjectId: file.project.id,
    projects: [project],
  };
}

export function createEmptyProjectFile(): PmgovFile {
  const now = new Date().toISOString();
  const project = emptyPortfolioProject();

  const { workstreams, stages, milestones, notes, decisions, actions, dependencies, risks, assumptions, issues, links, reports, ...projectFields } = project;
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    fileMetadata: { createdAt: now, updatedAt: now, createdByAppVersion: APP_VERSION },
    project: projectFields, workstreams, stages, milestones, notes, decisions, actions, dependencies, risks, assumptions, issues, links, reports,
    portfolio: { name: "Untitled Portfolio", description: "", sponsor: "", portfolioManager: "Portfolio Manager" },
    activeProjectId: project.id,
    projects: [project],
  };
}

export function createEmptyPortfolioProject(): PortfolioProject {
  return emptyPortfolioProject();
}

export function validatePmgovFile(value: unknown): ValidationResult {
  const result = pmgovFileSchema.safeParse(value);
  if (result.success) return { success: true, data: switchActiveProjectWorkspace(result.data, result.data.activeProjectId), migratedFromLegacy: false };

  const legacyResult = legacyPmgovFileSchema.safeParse(value);
  if (legacyResult.success) return { success: true, data: legacyFileToPortfolio(legacyResult.data), migratedFromLegacy: true };

  const message = result.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "file"}: ${issue.message}`).join("; ");
  return { success: false, error: `Invalid .pmgov file. ${message}` };
}

export function parsePmgovJson(text: string): ValidationResult {
  try {
    return validatePmgovFile(JSON.parse(text));
  } catch {
    return { success: false, error: "Invalid .pmgov file. The file is not valid JSON." };
  }
}

export function preparePmgovForSave(file: PmgovFile): PmgovFile {
  const syncedFile = syncActiveProjectToPortfolio(file);
  return {
    ...syncedFile,
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


export function isOpenDependency(dependency: Dependency) {
  return dependency.status !== "resolved";
}

export function isDependencyOverdue(dependency: Dependency, today: string) {
  const daysUntilDue = daysBetween(today, dependency.dueDate);
  return isOpenDependency(dependency) && daysUntilDue !== null && daysUntilDue < 0;
}

function dependencyHealthReasons(dependencies: Dependency[], today: string) {
  const redReasons: string[] = [];
  const amberReasons: string[] = [];

  dependencies.filter(isOpenDependency).forEach((dependency) => {
    if (dependency.status === "blocked") {
      redReasons.push(`Dependency "${dependency.title}" is blocked`);
      return;
    }

    if (isDependencyOverdue(dependency, today)) {
      amberReasons.push(`Dependency "${dependency.title}" is ${formatDateDistance(daysBetween(today, dependency.dueDate))}`);
    }
  });

  return { redReasons, amberReasons };
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

export function calculateWorkstreamHealth(file: LegacyPmgovFile, workstream: Workstream, today: string): CalculatedHealth {
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

  const dependencies = file.dependencies.filter((dependency) => dependency.sourceWorkstreamId === workstream.id || dependency.targetWorkstreamId === workstream.id);
  const dependencyReasons = dependencyHealthReasons(dependencies, today);
  redReasons.push(...dependencyReasons.redReasons);
  amberReasons.push(...dependencyReasons.amberReasons);

  const relatedRisks = file.risks.filter((risk) => risk.relatedWorkstreamId === workstream.id && risk.status !== "closed" && risk.status !== "mitigated");
  const highRisks = relatedRisks.filter((risk) => risk.probability === "high" || risk.impact === "high");
  if (highRisks.length > 1) redReasons.push(`Multiple high risks are open for workstream "${workstream.name}"`);
  else if (highRisks.length === 1) amberReasons.push(`High risk "${highRisks[0].title}" is open`);
  file.issues.filter((issue) => issue.relatedWorkstreamId === workstream.id && issue.severity === "critical" && issue.status !== "resolved" && issue.status !== "closed").forEach((issue) => redReasons.push(`Critical issue "${issue.title}" is open`));
  file.assumptions.filter((assumption) => assumption.relatedWorkstreamId === workstream.id && assumption.status === "invalidated").forEach((assumption) => amberReasons.push(`Assumption "${assumption.title}" is invalidated`));

  const calculatedStatus = redReasons.length > 0 ? "red" : amberReasons.length > 0 ? "amber" : milestones.length > 0 || actions.length > 0 || dependencies.length > 0 ? "green" : "not_set";
  const mode = workstream.healthMode ?? "auto";
  const manualStatus = workstream.status === "complete" ? "green" : workstream.status;

  return {
    status: mode === "manual" ? manualStatus : calculatedStatus,
    mode,
    calculatedStatus,
    manualStatus: mode === "manual" ? manualStatus : undefined,
    reasons: redReasons.length > 0 ? redReasons : amberReasons.length > 0 ? amberReasons : calculatedStatus === "green" ? ["No overdue milestones, overdue open actions, blocked dependencies, overdue dependencies, red milestones, or amber milestones found for this workstream."] : ["No milestones, linked actions, or dependencies are available to calculate workstream health."],
  };
}

export function calculateProjectHealth(file: LegacyPmgovFile, today: string): CalculatedHealth {
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

  const dependencyReasons = dependencyHealthReasons(file.dependencies, today);
  redReasons.push(...dependencyReasons.redReasons);
  amberReasons.push(...dependencyReasons.amberReasons);

  const highRisks = file.risks.filter((risk) => risk.status !== "closed" && risk.status !== "mitigated" && (risk.probability === "high" || risk.impact === "high"));
  if (highRisks.length > 1) redReasons.push("Multiple high risks are open");
  else if (highRisks.length === 1) amberReasons.push(`High risk "${highRisks[0].title}" is open`);
  file.issues.filter((issue) => issue.severity === "critical" && issue.status !== "resolved" && issue.status !== "closed").forEach((issue) => redReasons.push(`Critical issue "${issue.title}" is open`));
  file.assumptions.filter((assumption) => assumption.status === "invalidated").forEach((assumption) => amberReasons.push(`Assumption "${assumption.title}" is invalidated`));

  const calculatedStatus = redReasons.length > 0 ? "red" : amberReasons.length > 0 ? "amber" : "green";
  const mode = file.project.healthMode ?? "auto";

  return {
    status: mode === "manual" ? file.project.status : calculatedStatus,
    mode,
    calculatedStatus,
    manualStatus: mode === "manual" ? file.project.status : undefined,
    reasons: redReasons.length > 0 ? redReasons : amberReasons.length > 0 ? amberReasons : ["No overdue milestones, overdue open actions, blocked dependencies, overdue dependencies, red workstreams, red milestones, amber workstreams, or amber milestones found."],
  };
}

export function buildExecutiveReportMarkdown(file: LegacyPmgovFile, generatedAt: string, today: string) {
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
  const raidSummaryItems = [`Open Risks: ${file.risks.filter((risk) => risk.status === "open" || risk.status === "monitoring").length}`, `High Risks: ${file.risks.filter((risk) => risk.status !== "closed" && risk.status !== "mitigated" && (risk.probability === "high" || risk.impact === "high")).length}`, `Open Issues: ${file.issues.filter((issue) => issue.status === "open" || issue.status === "investigating").length}`, `Critical Issues: ${file.issues.filter((issue) => issue.severity === "critical" && issue.status !== "resolved" && issue.status !== "closed").length}`, `Invalidated Assumptions: ${file.assumptions.filter((assumption) => assumption.status === "invalidated").length}`];
  const topRiskItems = file.risks.filter((risk) => risk.status !== "closed" && risk.status !== "mitigated").sort((a, b) => (b.impact.localeCompare(a.impact) || b.probability.localeCompare(a.probability))).slice(0, 5).map((risk) => `${risk.title} — Owner: ${risk.owner || "Unassigned"}; Probability: ${statusLabel(risk.probability)}; Impact: ${statusLabel(risk.impact)}; Status: ${statusLabel(risk.status)}.`);
  const openIssueItems = file.issues.filter((issue) => issue.status !== "resolved" && issue.status !== "closed").map((issue) => `${issue.title} — Owner: ${issue.owner || "Unassigned"}; Severity: ${statusLabel(issue.severity)}; Target: ${issue.targetResolutionDate}; Status: ${statusLabel(issue.status)}.`);
  const dependencySummaryItems = file.dependencies.map((dependency) => `${dependency.title} — Owner: ${dependency.owner || "Unassigned"}; Due: ${dependency.dueDate} (${formatDateDistance(daysBetween(today, dependency.dueDate))}); Status: ${statusLabel(dependency.status)}.`);
  const blockedDependencyItems = file.dependencies.filter((dependency) => dependency.status === "blocked").map((dependency) => `${dependency.title} — Owner: ${dependency.owner || "Unassigned"}; Due: ${dependency.dueDate}; ${dependency.commentary || "No commentary"}.`);
  const decisionItems = [...file.decisions]
    .sort((a, b) => b.decisionDate.localeCompare(a.decisionDate))
    .slice(0, 8)
    .map((decision) => `${decision.decisionDate}: ${decision.title}${decision.decisionMaker ? ` — ${decision.decisionMaker}` : ""}. ${decision.decisionText}`);

  return `# Executive Status Report — ${file.project.name}\n\nGenerated: ${generatedAt}\n\n## Project Overview\n${file.project.description || "No project description captured."}\n\nSponsor: ${file.project.sponsor || "Not set"}\nProject Manager: ${file.project.projectManager || "Not set"}\nStart Date: ${file.project.startDate || "Not set"}\nTarget Date: ${file.project.targetDate || "Not set"}\n\n## Overall Status\nProject health: ${statusLabel(projectHealth.status)} (${statusLabel(projectHealth.mode)}${projectHealth.mode === "manual" ? ` override; auto would be ${statusLabel(projectHealth.calculatedStatus)}` : ""})
Health reasons: ${projectHealth.reasons.join("; ")}\n\n## Key Risks / Attention Items\n${lineItems(attentionItems, "No milestones requiring attention.")}\n\n## Milestone Outlook\n${lineItems(upcomingItems, "No upcoming milestones captured.")}\n\n## Workstream Health\n${lineItems(workstreamItems, "No workstreams captured.")}\n\n## Open Actions\n${lineItems(actionItems, "No open actions captured.")}\n\n## RAID Summary\n${lineItems(raidSummaryItems, "No RAID records captured.")}\n\n## Top Risks\n${lineItems(topRiskItems, "No open risks captured.")}\n\n## Open Issues\n${lineItems(openIssueItems, "No open issues captured.")}\n\n## Dependency Summary\n${lineItems(dependencySummaryItems, "No dependencies captured.")}\n\n## Blocked Dependencies\n${lineItems(blockedDependencyItems, "No blocked dependencies captured.")}\n\n## Recent Decisions\n${lineItems(decisionItems, "No recent decisions captured.")}\n\n## Executive Summary\n${file.project.executiveSummary || "No executive summary has been entered for this project."}\n`;
}

export function calculatePortfolioHealth(file: PmgovFile, today: string): CalculatedHealth {
  const redReasons: string[] = [];
  const amberReasons: string[] = [];
  file.projects.forEach((project) => {
    const health = calculateProjectHealth(projectWorkspaceToLegacyFile(file, project), today);
    if (health.status === "red") redReasons.push(`Project "${project.name}" is red`);
    if (health.status === "amber") amberReasons.push(`Project "${project.name}" is amber`);
    project.issues.filter((issue) => issue.severity === "critical" && issue.status !== "resolved" && issue.status !== "closed").forEach((issue) => redReasons.push(`Critical issue "${issue.title}" is open in ${project.name}`));
    project.risks.filter((risk) => risk.status !== "closed" && risk.status !== "mitigated" && (risk.probability === "high" || risk.impact === "high")).forEach((risk) => amberReasons.push(`High risk "${risk.title}" is open in ${project.name}`));
    project.dependencies.filter((dependency) => dependency.status === "blocked").forEach((dependency) => redReasons.push(`Dependency "${dependency.title}" is blocked in ${project.name}`));
  });
  const calculatedStatus = redReasons.length > 0 ? "red" : amberReasons.length > 0 ? "amber" : "green";
  return { status: calculatedStatus, mode: "auto", calculatedStatus, reasons: redReasons.length > 0 ? redReasons : amberReasons.length > 0 ? amberReasons : ["No red projects, critical issues, high risks, or blocked dependencies found across the portfolio."] };
}

export function buildPortfolioExecutiveReportMarkdown(file: PmgovFile, generatedAt: string, today: string) {
  const portfolioHealth = calculatePortfolioHealth(file, today);
  const projectSummary = file.projects.map((project) => {
    const health = calculateProjectHealth(projectWorkspaceToLegacyFile(file, project), today);
    return `| ${project.id} | ${project.name} | ${statusLabel(health.status)} | ${project.sponsor || "Not set"} | ${project.projectManager || "Not set"} | ${project.startDate || "Not set"} | ${project.targetDate || "Not set"} |`;
  }).join("\n");
  const portfolioRisks = file.projects.flatMap((project) => project.risks.filter((risk) => risk.status !== "closed" && risk.status !== "mitigated").map((risk) => `- ${project.name}: ${risk.title} — Probability: ${statusLabel(risk.probability)}; Impact: ${statusLabel(risk.impact)}; Owner: ${risk.owner || "Unassigned"}.`));
  const criticalIssues = file.projects.flatMap((project) => project.issues.filter((issue) => issue.severity === "critical" && issue.status !== "resolved" && issue.status !== "closed").map((issue) => `- ${project.name}: ${issue.title} — Owner: ${issue.owner || "Unassigned"}; Target: ${issue.targetResolutionDate}.`));
  const crossProjectDependencies = file.projects.flatMap((project) => project.dependencies.filter((dependency) => dependency.status !== "resolved").map((dependency) => `- ${project.name}: ${dependency.title} — Status: ${statusLabel(dependency.status)}; Owner: ${dependency.owner || "Unassigned"}; Due: ${dependency.dueDate}.`));
  return `# Portfolio Executive Report — ${file.portfolio.name}\n\nGenerated: ${generatedAt}\n\n## Portfolio Health\nPortfolio health: ${statusLabel(portfolioHealth.status)}\n\nHealth reasons: ${portfolioHealth.reasons.join("; ")}\n\n## Project Summary\n| Project ID | Name | Health | Sponsor | Project Manager | Start Date | Target Date |\n| --- | --- | --- | --- | --- | --- | --- |\n${projectSummary || "| Not set | No projects | not set | Not set | Not set | Not set | Not set |"}\n\n## Portfolio Risks\n${portfolioRisks.length > 0 ? portfolioRisks.join("\n") : "No open portfolio risks captured."}\n\n## Critical Issues\n${criticalIssues.length > 0 ? criticalIssues.join("\n") : "No open critical issues captured."}\n\n## Cross-project Dependencies\n${crossProjectDependencies.length > 0 ? crossProjectDependencies.join("\n") : "No open dependencies captured."}\n`;
}
