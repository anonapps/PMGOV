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
const actionStatusSchema = z.enum(["open", "in_progress", "complete", "cancelled"]);
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
      owner: z.string().optional(),
      targetDate: isoDate.optional(),
      commentary: z.string().optional(),
      sortOrder: z.number(),
    }),
  ),
  stages: z.array(
    z.object({
      id: z.string().min(1),
      workstreamId: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      status: stageStatusSchema.optional(),
      owner: z.string().optional(),
      targetDate: isoDate.optional(),
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
      owner: z.string().optional(),
      targetDate: isoDate.optional(),
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
      type: noteTypeSchema.optional(),
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
