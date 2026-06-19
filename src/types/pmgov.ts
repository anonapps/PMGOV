export type RagStatus = "green" | "amber" | "red" | "not_set";
export type WorkstreamStatus = RagStatus | "complete";
export type StageStatus = "not_started" | "in_progress" | "complete" | "blocked";
export type MilestoneStatus = RagStatus | "complete";
export type ActionStatus = "open" | "in_progress" | "complete" | "cancelled";
export type NoteType = "meeting" | "workshop" | "general";
export type ImpactLevel = "low" | "medium" | "high" | "critical" | "not_set";
export type EntityType = "note" | "decision" | "action" | "milestone" | "workstream" | "stage";
export type ReportType = "status" | "steering_committee" | "executive";

export interface PmgovFile {
  schemaVersion: "1.0.0";
  fileMetadata: FileMetadata;
  project: Project;
  workstreams: Workstream[];
  stages: Stage[];
  milestones: Milestone[];
  notes: Note[];
  decisions: Decision[];
  actions: ActionItem[];
  links: EntityLink[];
  reports: Report[];
}

export interface FileMetadata {
  createdAt: string;
  updatedAt: string;
  createdByAppVersion?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  sponsor?: string;
  projectManager: string;
  startDate?: string;
  targetDate?: string;
  status: RagStatus;
  executiveSummary?: string;
}

export interface Workstream {
  id: string;
  name: string;
  description?: string;
  status: WorkstreamStatus;
  owner?: string;
  targetDate?: string;
  commentary?: string;
  sortOrder: number;
}

export interface Stage {
  id: string;
  workstreamId: string;
  name: string;
  description?: string;
  status?: StageStatus;
  owner?: string;
  targetDate?: string;
  commentary?: string;
  sortOrder: number;
}

export interface Milestone {
  id: string;
  stageId: string;
  name: string;
  description?: string;
  owner?: string;
  targetDate?: string;
  plannedDate: string;
  forecastDate?: string;
  actualDate?: string;
  status: MilestoneStatus;
  commentary?: string;
}

export interface Note {
  id: string;
  title: string;
  type?: NoteType;
  content: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Decision {
  id: string;
  title: string;
  context?: string;
  decisionText: string;
  decisionMaker?: string;
  decisionDate: string;
  impact?: ImpactLevel;
  evidenceLinks?: string[];
}

export interface ActionItem {
  id: string;
  description: string;
  owner: string;
  dueDate?: string;
  status: ActionStatus;
  commentary?: string;
}

export interface EntityLink {
  id: string;
  sourceType: EntityType;
  sourceId: string;
  targetType: EntityType;
  targetId: string;
  relationship?: string;
}

export interface Report {
  id: string;
  type: ReportType;
  title: string;
  generatedAt: string;
  content: string;
}
