"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import type { ActionItem, ActionStatus, Decision, Assumption, AssumptionStatus, Dependency, DependencyStatus, EntityLink, EntityType, HealthMode, ImpactLevel, Issue, IssueSeverity, IssueStatus, Milestone, MilestoneStatus, Note, NoteType, PmgovFile, RagStatus, RaidLevel, Risk, RiskStatus, Stage, StageStatus, Workstream, WorkstreamStatus } from "@/types/pmgov";
import {
  buildPmgovFilename,
  calculateProjectHealth,
  calculateWorkstreamHealth,
  createEmptyProjectFile,
  parsePmgovJson,
  preparePmgovForSave,
  serializePmgovFile,
  validatePmgovFile,
} from "@/lib/pmgov";

const navigationItems = ["Dashboard", "Workstreams", "Timeline", "Notebook", "Governance", "Dependencies", "RAID", "Reports", "Settings"] as const;
const projectStatuses: RagStatus[] = ["not_set", "green", "amber", "red"];
const healthModes: HealthMode[] = ["auto", "manual"];
const workstreamStatuses: WorkstreamStatus[] = ["not_set", "green", "amber", "red", "complete"];
const stageStatuses: StageStatus[] = ["not_started", "in_progress", "complete", "blocked"];
const milestoneStatuses: MilestoneStatus[] = ["not_set", "green", "amber", "red", "complete"];
const actionStatuses: ActionStatus[] = ["open", "in_progress", "completed", "cancelled"];
const dependencyStatuses: DependencyStatus[] = ["open", "in_progress", "resolved", "blocked"];
const raidLevels: RaidLevel[] = ["low", "medium", "high"];
const riskStatuses: RiskStatus[] = ["open", "monitoring", "mitigated", "closed"];
const assumptionStatuses: AssumptionStatus[] = ["active", "validated", "invalidated"];
const issueSeverities: IssueSeverity[] = ["low", "medium", "high", "critical"];
const issueStatuses: IssueStatus[] = ["open", "investigating", "resolved", "closed"];
const noteTypes: NoteType[] = ["meeting", "workshop", "general"];
const impactLevels: ImpactLevel[] = ["low", "medium", "high", "critical"];
const dueWindowOptions = ["All", "Overdue", "Next 30 days", "Completed"] as const;
const timelineSortOptions = ["Planned Date", "Forecast Date", "Status", "Workstream"] as const;

type NavigationItem = (typeof navigationItems)[number];
type Message = { tone: "success" | "error" | "info"; text: string };
type DueWindowFilter = (typeof dueWindowOptions)[number];
type TimelineSortOption = (typeof timelineSortOptions)[number];

type TimelineMilestone = {
  milestone: Milestone;
  stage?: Stage;
  workstream?: Workstream;
  daysUntilPlanned: number | null;
  daysUntilForecast: number | null;
  isLate: boolean;
  isDueSoon: boolean;
  isComplete: boolean;
};

type DashboardMilestone = {
  milestone: Milestone;
  stage?: Stage;
  workstream?: Workstream;
  reasons: string[];
  daysUntilPlanned: number | null;
};

type DashboardAction = {
  action: PmgovFile["actions"][number];
  daysUntilDue: number | null;
};

type ReportMilestone = {
  milestone: Milestone;
  stage?: Stage;
  workstream?: Workstream;
  daysUntilPlanned: number | null;
  reasons?: string[];
};

type ExecutiveReportData = {
  generatedAt: string;
  attentionMilestones: ReportMilestone[];
  upcomingMilestones: ReportMilestone[];
  openActions: DashboardAction[];
  dependencies: Dependency[];
  blockedDependencies: Dependency[];
  topRisks: Risk[];
  openIssues: Issue[];
  recentDecisions: Decision[];
  workstreamHealth: { workstream: Workstream; health: ReturnType<typeof calculateWorkstreamHealth> }[];
  projectHealth: ReturnType<typeof calculateProjectHealth>;
};

function getMilestoneContext(file: PmgovFile, milestone: Milestone) {
  const stage = file.stages.find((item) => item.id === milestone.stageId);
  const workstream = stage ? file.workstreams.find((item) => item.id === stage.workstreamId) : undefined;

  return { stage, workstream };
}

function getMilestoneAttentionReasons(milestone: Milestone, today = todayIsoDate()) {
  const reasons: string[] = [];
  const daysUntilPlanned = daysBetween(today, milestone.plannedDate);
  const daysUntilForecast = daysBetween(today, milestone.forecastDate);
  const forecastVariance = daysBetween(milestone.plannedDate, milestone.forecastDate);
  const isComplete = milestone.status === "complete";

  if (milestone.status === "amber" || milestone.status === "red") {
    reasons.push(`${statusLabel(milestone.status)} status`);
  }

  if (forecastVariance !== null && forecastVariance > 0) {
    reasons.push("forecast is later than planned");
  }

  if (!isComplete && daysUntilPlanned !== null && daysUntilPlanned >= 0 && daysUntilPlanned <= 30) {
    reasons.push("planned date is due within 30 days");
  }

  if (!isComplete && daysUntilForecast !== null && daysUntilForecast >= 0 && daysUntilForecast <= 30) {
    reasons.push("forecast date is due within 30 days");
  }

  if (!isComplete && daysUntilPlanned !== null && daysUntilPlanned < 0) {
    reasons.push("planned date is in the past");
  }

  if (!isComplete && daysUntilForecast !== null && daysUntilForecast < 0) {
    reasons.push("forecast date is in the past");
  }

  return reasons;
}

function formatDateDistance(days: number | null) {
  if (days === null) {
    return "No date";
  }

  if (days === 0) {
    return "Today";
  }

  return days > 0 ? `In ${days} day${days === 1 ? "" : "s"}` : `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
}

function statusTone(status: string) {
  if (status === "red" || status === "blocked") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (status === "amber" || status === "in_progress") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (status === "green" || status === "complete") {
    return "border-green-200 bg-green-50 text-green-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}


function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(startDate: string, endDate?: string) {
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

function formatVariance(milestone: Milestone) {
  const comparisonDate = milestone.actualDate || milestone.forecastDate;
  const variance = daysBetween(milestone.plannedDate, comparisonDate);

  if (variance === null) {
    return "No forecast/actual date";
  }

  if (variance === 0) {
    return "On plan";
  }

  return `${Math.abs(variance)} day${Math.abs(variance) === 1 ? "" : "s"} ${variance > 0 ? "late" : "early"}`;
}

function optionalDate(value: string) {
  return value || undefined;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function nextSortOrder(items: { sortOrder: number }[]) {
  return items.reduce((highest, item) => Math.max(highest, item.sortOrder), 0) + 1;
}

function countRecords(file: PmgovFile) {
  return [
    ["Workstreams", file.workstreams.length],
    ["Stages", file.stages.length],
    ["Milestones", file.milestones.length],
    ["Notes", file.notes.length],
    ["Decisions", file.decisions.length],
    ["Actions", file.actions.length],
    ["Dependencies", file.dependencies.length],
    ["Risks", file.risks.length],
    ["Assumptions", file.assumptions.length],
    ["Issues", file.issues.length],
    ["Links", file.links.length],
    ["Reports", file.reports.length],
  ] as const;
}


type DeliveryLinkTarget = Extract<EntityType, "workstream" | "stage" | "milestone" | "action">;
type GovernanceSourceType = Extract<EntityType, "action" | "decision">;
const deliveryRelationship = "delivery_context";

function getLinkedTargetId(file: PmgovFile, sourceType: GovernanceSourceType, sourceId: string, targetType: DeliveryLinkTarget) {
  return file.links.find((link) => link.sourceType === sourceType && link.sourceId === sourceId && link.targetType === targetType && link.relationship === deliveryRelationship)?.targetId ?? "";
}

function setGovernanceLink(links: EntityLink[], sourceType: GovernanceSourceType, sourceId: string, targetType: DeliveryLinkTarget, targetId: string) {
  const withoutExisting = links.filter((link) => !(link.sourceType === sourceType && link.sourceId === sourceId && link.targetType === targetType && link.relationship === deliveryRelationship));

  if (!targetId) {
    return withoutExisting;
  }

  return [...withoutExisting, { id: crypto.randomUUID(), sourceType, sourceId, targetType, targetId, relationship: deliveryRelationship }];
}

function getDeliveryContext(file: PmgovFile, sourceType: GovernanceSourceType, sourceId: string) {
  const workstreamId = getLinkedTargetId(file, sourceType, sourceId, "workstream");
  const stageId = getLinkedTargetId(file, sourceType, sourceId, "stage");
  const milestoneId = getLinkedTargetId(file, sourceType, sourceId, "milestone");
  const actionId = sourceType === "decision" ? getLinkedTargetId(file, sourceType, sourceId, "action") : "";

  return {
    workstreamId,
    stageId,
    milestoneId,
    actionId,
    workstream: workstreamId ? file.workstreams.find((item) => item.id === workstreamId) : undefined,
    stage: stageId ? file.stages.find((item) => item.id === stageId) : undefined,
    milestone: milestoneId ? file.milestones.find((item) => item.id === milestoneId) : undefined,
    action: actionId ? file.actions.find((item) => item.id === actionId) : undefined,
  };
}

function formatLinkedContext(file: PmgovFile, sourceType: GovernanceSourceType, sourceId: string) {
  const context = getDeliveryContext(file, sourceType, sourceId);
  const labels: string[] = [];

  if (context.workstreamId) labels.push(`Workstream: ${context.workstream?.name ?? "Deleted or unavailable item"}`);
  if (context.stageId) labels.push(`Stage: ${context.stage?.name ?? "Deleted or unavailable item"}`);
  if (context.milestoneId) labels.push(`Milestone: ${context.milestone?.name ?? "Deleted or unavailable item"}`);
  if (context.actionId) labels.push(`Action: ${context.action?.description ?? "Deleted or unavailable item"}`);

  return labels.length > 0 ? labels.join(" · ") : "No delivery context linked";
}

function formatNavId(item: string) {
  return item.toLowerCase().replaceAll(" ", "-");
}

function downloadProjectFile(file: PmgovFile, requestedName?: string) {
  const serialized = serializePmgovFile(file);
  const blob = new Blob([serialized], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const filename = requestedName ?? buildPmgovFilename(file.project.name);

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  return { filename, serialized };
}

export function ProjectFileWorkspace() {
  const [projectFile, setProjectFile] = useState<PmgovFile | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);
  const [openedFileName, setOpenedFileName] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<NavigationItem>("Dashboard");
  const [activeGovernanceTab, setActiveGovernanceTab] = useState<"Actions" | "Decisions">("Actions");
  const [activeRaidTab, setActiveRaidTab] = useState<"Risks" | "Assumptions" | "Issues">("Risks");
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [noteTypeFilter, setNoteTypeFilter] = useState<NoteType | "all">("all");
  const [noteTagFilter, setNoteTagFilter] = useState("all");
  const [timelineStatusFilter, setTimelineStatusFilter] = useState<MilestoneStatus | "all">("all");
  const [timelineWorkstreamFilter, setTimelineWorkstreamFilter] = useState<string>("all");
  const [timelineDueWindowFilter, setTimelineDueWindowFilter] = useState<DueWindowFilter>("All");
  const [timelineSortOption, setTimelineSortOption] = useState<TimelineSortOption>("Planned Date");
  const [dependencyStatusFilter, setDependencyStatusFilter] = useState<DependencyStatus | "all">("all");
  const [dependencyWorkstreamFilter, setDependencyWorkstreamFilter] = useState("all");
  const [dependencySearchQuery, setDependencySearchQuery] = useState("");
  const [raidSearchQuery, setRaidSearchQuery] = useState("");
  const [raidStatusFilter, setRaidStatusFilter] = useState("all");
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string>(() => new Date().toISOString());
  const [message, setMessage] = useState<Message>({
    tone: "info",
    text: "Create a new local project file or open an existing .pmgov file to begin.",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentSnapshot = useMemo(() => (projectFile ? serializePmgovFile(projectFile) : null), [projectFile]);
  const isDirty = projectFile !== null && currentSnapshot !== lastSavedSnapshot;
  const validation = useMemo(() => (projectFile ? validatePmgovFile(projectFile) : null), [projectFile]);

  function confirmDiscardUnsavedChanges(nextAction: string) {
    return !isDirty || window.confirm(`You have unsaved changes. ${nextAction} will discard changes that have not been saved to a .pmgov file. Continue?`);
  }

  function createNewProject() {
    if (!confirmDiscardUnsavedChanges("Creating a new project")) {
      return;
    }

    const nextFile = createEmptyProjectFile();
    setProjectFile(nextFile);
    setLastSavedSnapshot(null);
    setOpenedFileName(null);
    setActiveView("Dashboard");
    setReportGeneratedAt(new Date().toISOString());
    setMessage({ tone: "success", text: "New in-memory project created. Use Save As to write a .pmgov file." });
  }

  async function openProject(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";

    if (!selectedFile) {
      return;
    }

    if (!confirmDiscardUnsavedChanges("Opening another file")) {
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith(".pmgov")) {
      setMessage({ tone: "error", text: "Please choose a valid .pmgov file. Other file types are not supported." });
      return;
    }

    const result = parsePmgovJson(await selectedFile.text());

    if (!result.success) {
      setMessage({ tone: "error", text: result.error });
      return;
    }

    const snapshot = serializePmgovFile(result.data);
    setProjectFile(result.data);
    setLastSavedSnapshot(snapshot);
    setOpenedFileName(selectedFile.name);
    setActiveView("Dashboard");
    setReportGeneratedAt(new Date().toISOString());
    setMessage({ tone: "success", text: `${selectedFile.name} opened and validated locally.` });
  }

  function saveProject(saveAs = false) {
    if (!projectFile) {
      setMessage({ tone: "error", text: "Save is unavailable until you create a new project or open an existing .pmgov file." });
      return;
    }

    const preparedFile = preparePmgovForSave(projectFile);
    const validationResult = validatePmgovFile(preparedFile);

    if (!validationResult.success) {
      setMessage({ tone: "error", text: validationResult.error });
      return;
    }

    const requestedName = saveAs ? buildPmgovFilename(validationResult.data.project.name) : openedFileName ?? undefined;
    const { filename, serialized } = downloadProjectFile(validationResult.data, requestedName);

    setProjectFile(validationResult.data);
    setLastSavedSnapshot(serialized);
    setOpenedFileName(filename);
    setMessage({ tone: "success", text: `${filename} saved from browser memory. No project data was sent to a server.` });
  }


  function mutateProjectFile(updater: (current: PmgovFile) => PmgovFile, successText: string) {
    setProjectFile((current) => {
      if (!current) {
        return current;
      }

      return updater(current);
    });
    setMessage({ tone: "success", text: successText });
  }

  function updateProject(patch: Partial<PmgovFile["project"]>) {
    mutateProjectFile((current) => ({ ...current, project: { ...current.project, ...patch } }), "Project updated.");
  }

  function addWorkstream() {
    const workstream: Workstream = {
      id: crypto.randomUUID(),
      name: "New workstream",
      description: "",
      status: "not_set",
      healthMode: "auto",
      commentary: "",
      sortOrder: nextSortOrder(projectFile?.workstreams ?? []),
    };

    mutateProjectFile((current) => ({ ...current, workstreams: [...current.workstreams, workstream] }), "Workstream added.");
  }

  function updateWorkstream(id: string, patch: Partial<Workstream>) {
    mutateProjectFile((current) => ({ ...current, workstreams: current.workstreams.map((workstream) => (workstream.id === id ? { ...workstream, ...patch } : workstream)) }), "Workstream updated.");
  }

  function deleteWorkstream(workstream: Workstream) {
    const childStages = projectFile?.stages.filter((stage) => stage.workstreamId === workstream.id) ?? [];
    const childStageIds = new Set(childStages.map((stage) => stage.id));
    const childMilestones = projectFile?.milestones.filter((milestone) => childStageIds.has(milestone.stageId)) ?? [];

    if (!window.confirm(`Delete workstream "${workstream.name}"? This will also delete ${childStages.length} stage(s) and ${childMilestones.length} milestone(s). This cannot be undone.`)) {
      return;
    }

    mutateProjectFile(
      (current) => ({
        ...current,
        workstreams: current.workstreams.filter((item) => item.id !== workstream.id),
        stages: current.stages.filter((stage) => stage.workstreamId !== workstream.id),
        milestones: current.milestones.filter((milestone) => !childStageIds.has(milestone.stageId)),
      }),
      "Workstream and child records deleted.",
    );
  }

  function addStage(workstreamId: string) {
    const stagesForWorkstream = projectFile?.stages.filter((stage) => stage.workstreamId === workstreamId) ?? [];
    const stage: Stage = { id: crypto.randomUUID(), workstreamId, name: "New stage", status: "not_started", commentary: "", sortOrder: nextSortOrder(stagesForWorkstream) };
    mutateProjectFile((current) => ({ ...current, stages: [...current.stages, stage] }), "Stage added.");
  }

  function updateStage(id: string, patch: Partial<Stage>) {
    mutateProjectFile((current) => ({ ...current, stages: current.stages.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)) }), "Stage updated.");
  }

  function deleteStage(stage: Stage) {
    const childMilestones = projectFile?.milestones.filter((milestone) => milestone.stageId === stage.id) ?? [];

    if (!window.confirm(`Delete stage "${stage.name}"? This will also delete ${childMilestones.length} milestone(s). This cannot be undone.`)) {
      return;
    }

    mutateProjectFile(
      (current) => ({ ...current, stages: current.stages.filter((item) => item.id !== stage.id), milestones: current.milestones.filter((milestone) => milestone.stageId !== stage.id) }),
      "Stage and child milestones deleted.",
    );
  }

  function addMilestone(stageId: string) {
    const milestone: Milestone = { id: crypto.randomUUID(), stageId, name: "New milestone", description: "", plannedDate: todayIsoDate(), status: "not_set", commentary: "" };
    mutateProjectFile((current) => ({ ...current, milestones: [...current.milestones, milestone] }), "Milestone added.");
  }

  function updateMilestone(id: string, patch: Partial<Milestone>) {
    mutateProjectFile((current) => ({ ...current, milestones: current.milestones.map((milestone) => (milestone.id === id ? { ...milestone, ...patch } : milestone)) }), "Milestone updated.");
  }

  function deleteMilestone(milestone: Milestone) {
    if (!window.confirm(`Delete milestone "${milestone.name}"? This cannot be undone.`)) {
      return;
    }

    mutateProjectFile((current) => ({ ...current, milestones: current.milestones.filter((item) => item.id !== milestone.id) }), "Milestone deleted.");
  }

  function renderRelatedGovernance(file: PmgovFile, targetType: DeliveryLinkTarget, targetId: string) {
    const actionIds = new Set(file.links.filter((link) => link.sourceType === "action" && link.targetType === targetType && link.targetId === targetId && link.relationship === deliveryRelationship).map((link) => link.sourceId));
    const decisionIds = new Set(file.links.filter((link) => link.sourceType === "decision" && link.targetType === targetType && link.targetId === targetId && link.relationship === deliveryRelationship).map((link) => link.sourceId));
    const relatedActions = file.actions.filter((action) => actionIds.has(action.id));
    const relatedDecisions = file.decisions.filter((decision) => decisionIds.has(decision.id));

    if (relatedActions.length === 0 && relatedDecisions.length === 0) {
      return <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600">No related actions or decisions linked.</p>;
    }

    return (
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-3"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Related actions</p>{relatedActions.length === 0 ? <p className="mt-2 text-sm text-slate-600">None linked.</p> : <ul className="mt-2 space-y-1 text-sm text-slate-700">{relatedActions.map((action) => <li key={action.id}>{action.description} <span className="text-slate-500">({statusLabel(action.status)})</span></li>)}</ul>}</div>
        <div className="rounded-2xl bg-white p-3"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Related decisions</p>{relatedDecisions.length === 0 ? <p className="mt-2 text-sm text-slate-600">None linked.</p> : <ul className="mt-2 space-y-1 text-sm text-slate-700">{relatedDecisions.map((decision) => <li key={decision.id}>{decision.title} <span className="text-slate-500">({decision.decisionDate})</span></li>)}</ul>}</div>
      </div>
    );
  }

  function renderWorkstreamsWorkspace(file: PmgovFile) {
    const sortedWorkstreams = [...file.workstreams].sort((a, b) => a.sortOrder - b.sortOrder);

    return (
      <section className="grid gap-6 xl:grid-cols-[20rem_1fr]" id="workstreams">
        <aside className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Workstreams</p>
              <h3 className="mt-2 text-xl font-bold">Workstream list</h3>
            </div>
            <button className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white" onClick={addWorkstream} type="button">Add</button>
          </div>
          {sortedWorkstreams.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No workstreams yet. Add a workstream to start structuring this project.</p>
          ) : (
            <div className="mt-5 space-y-3">{sortedWorkstreams.map((workstream) => (<a className="block rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-800 hover:border-blue-300 hover:bg-blue-50" href={`#workstream-${workstream.id}`} key={workstream.id}>{workstream.name}<span className="mt-1 block text-xs font-medium text-slate-500">{statusLabel(workstream.status)}</span></a>))}</div>
          )}
        </aside>
        <div className="space-y-6">
          {sortedWorkstreams.length === 0 ? (
            <section className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8"><h3 className="text-2xl font-bold">No workstream selected</h3><p className="mt-3 text-sm text-slate-600">Create a workstream, then add stages and milestones underneath it.</p></section>
          ) : sortedWorkstreams.map((workstream) => {
            const stages = file.stages.filter((stage) => stage.workstreamId === workstream.id).sort((a, b) => a.sortOrder - b.sortOrder);
            const calculatedHealth = calculateWorkstreamHealth(file, workstream, todayIsoDate());
            return (
              <section className="rounded-3xl border border-slate-200 bg-white p-6" id={`workstream-${workstream.id}`} key={workstream.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Selected workstream</p><h3 className="mt-2 text-2xl font-bold">{workstream.name}</h3></div><div className="flex gap-2"><button className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={() => addStage(workstream.id)} type="button">Add stage</button><button className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700" onClick={() => deleteWorkstream(workstream)} type="button">Delete</button></div></div>
                <div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium text-slate-700">Name <span className="text-red-600" aria-label="required">*</span><input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateWorkstream(workstream.id, { name: event.target.value })} value={workstream.name} /></label><label className="text-sm font-medium text-slate-700">Health mode<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateWorkstream(workstream.id, { healthMode: event.target.value as HealthMode })} value={workstream.healthMode ?? "auto"}>{healthModes.map((mode) => (<option key={mode} value={mode}>{statusLabel(mode)}</option>))}</select></label><label className="text-sm font-medium text-slate-700">Manual override<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" disabled={(workstream.healthMode ?? "auto") === "auto"} onChange={(event) => updateWorkstream(workstream.id, { status: event.target.value as WorkstreamStatus })} value={workstream.status}>{workstreamStatuses.map((status) => (<option key={status} value={status}>{statusLabel(status)}</option>))}</select></label><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm md:col-span-2"><p className="font-bold text-slate-900">Calculated health: <span className={`rounded-full border px-2 py-0.5 text-xs uppercase ${statusTone(calculatedHealth.status)}`}>{statusLabel(calculatedHealth.status)}</span></p><p className="mt-1 font-semibold text-slate-700">Mode: {statusLabel(calculatedHealth.mode)}{calculatedHealth.mode === "manual" ? ` override (auto would be ${statusLabel(calculatedHealth.calculatedStatus)})` : ""}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">{calculatedHealth.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div><label className="text-sm font-medium text-slate-700 md:col-span-2">Description<textarea className="mt-2 min-h-20 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateWorkstream(workstream.id, { description: event.target.value })} value={workstream.description ?? ""} /></label><label className="text-sm font-medium text-slate-700 md:col-span-2">Commentary<textarea className="mt-2 min-h-20 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateWorkstream(workstream.id, { commentary: event.target.value })} value={workstream.commentary ?? ""} /></label></div>{renderRelatedGovernance(file, "workstream", workstream.id)}
                <div className="mt-6 space-y-4">{stages.length === 0 ? (<p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No stages yet. Add a stage for this workstream.</p>) : stages.map((stage) => {
                  const milestones = file.milestones.filter((milestone) => milestone.stageId === stage.id);
                  return (<div className="rounded-3xl border border-slate-200 bg-slate-50 p-5" key={stage.id}><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="grid flex-1 gap-3 md:grid-cols-2"><label className="text-sm font-medium text-slate-700">Stage name<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateStage(stage.id, { name: event.target.value })} value={stage.name} /></label><label className="text-sm font-medium text-slate-700">Stage status<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateStage(stage.id, { status: event.target.value as StageStatus })} value={stage.status ?? "not_started"}>{stageStatuses.map((status) => (<option key={status} value={status}>{statusLabel(status)}</option>))}</select></label><label className="text-sm font-medium text-slate-700 md:col-span-2">Stage commentary<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateStage(stage.id, { commentary: event.target.value })} value={stage.commentary ?? ""} /></label></div><div className="flex gap-2"><button className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={() => addMilestone(stage.id)} type="button">Add milestone</button><button className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700" onClick={() => deleteStage(stage)} type="button">Delete</button></div></div>{renderRelatedGovernance(file, "stage", stage.id)}<div className="mt-4 space-y-3">{milestones.length === 0 ? (<p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">No milestones yet for this stage.</p>) : milestones.map((milestone) => (<div className="rounded-2xl border border-slate-200 bg-white p-4" key={milestone.id}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium text-slate-700 xl:col-span-2">Milestone name<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateMilestone(milestone.id, { name: event.target.value })} value={milestone.name} /></label><label className="text-sm font-medium text-slate-700">Status<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateMilestone(milestone.id, { status: event.target.value as MilestoneStatus })} value={milestone.status}>{milestoneStatuses.map((status) => (<option key={status} value={status}>{statusLabel(status)}</option>))}</select></label><div className="rounded-2xl bg-slate-100 p-3 text-sm"><span className="font-semibold text-slate-500">Variance</span><span className="mt-1 block font-bold text-slate-900">{formatVariance(milestone)}</span></div><label className="text-sm font-medium text-slate-700">Planned date<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateMilestone(milestone.id, { plannedDate: event.target.value })} type="date" value={milestone.plannedDate} /></label><label className="text-sm font-medium text-slate-700">Forecast date<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateMilestone(milestone.id, { forecastDate: optionalDate(event.target.value) })} type="date" value={milestone.forecastDate ?? ""} /></label><label className="text-sm font-medium text-slate-700">Actual date<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateMilestone(milestone.id, { actualDate: optionalDate(event.target.value) })} type="date" value={milestone.actualDate ?? ""} /></label><button className="self-end rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700" onClick={() => deleteMilestone(milestone)} type="button">Delete milestone</button><label className="text-sm font-medium text-slate-700 md:col-span-2">Description<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateMilestone(milestone.id, { description: event.target.value })} value={milestone.description ?? ""} /></label><label className="text-sm font-medium text-slate-700 md:col-span-2">Commentary<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateMilestone(milestone.id, { commentary: event.target.value })} value={milestone.commentary ?? ""} /></label></div>{renderRelatedGovernance(file, "milestone", milestone.id)}</div>))}</div></div>);
                })}</div>
              </section>
            );
          })}
        </div>
      </section>
    );
  }

  function renderDashboard(file: PmgovFile) {
    const today = todayIsoDate();
    const attentionMilestones: DashboardMilestone[] = file.milestones
      .map((milestone) => ({
        milestone,
        ...getMilestoneContext(file, milestone),
        reasons: getMilestoneAttentionReasons(milestone, today),
        daysUntilPlanned: daysBetween(today, milestone.plannedDate),
      }))
      .filter((item) => item.reasons.length > 0)
      .sort((a, b) => (a.daysUntilPlanned ?? Number.MAX_SAFE_INTEGER) - (b.daysUntilPlanned ?? Number.MAX_SAFE_INTEGER));
    const upcomingMilestones = file.milestones
      .filter((milestone) => milestone.status !== "complete")
      .map((milestone) => ({ milestone, ...getMilestoneContext(file, milestone), daysUntilPlanned: daysBetween(today, milestone.plannedDate) }))
      .filter((item) => item.daysUntilPlanned !== null && item.daysUntilPlanned >= 0)
      .sort((a, b) => (a.daysUntilPlanned ?? 0) - (b.daysUntilPlanned ?? 0))
      .slice(0, 6);
    const openActions: DashboardAction[] = file.actions
      .filter((action) => action.status !== "completed" && action.status !== "cancelled")
      .map((action) => ({ action, daysUntilDue: daysBetween(today, action.dueDate) }))
      .sort((a, b) => (a.daysUntilDue ?? Number.MAX_SAFE_INTEGER) - (b.daysUntilDue ?? Number.MAX_SAFE_INTEGER));
    const openDependencies = file.dependencies.filter((dependency) => dependency.status !== "resolved").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const blockedDependencies = openDependencies.filter((dependency) => dependency.status === "blocked");
    const overdueDependencies = openDependencies.filter((dependency) => isDependencyOverdue(dependency));
    const recentDecisions = [...file.decisions].sort((a, b) => b.decisionDate.localeCompare(a.decisionDate)).slice(0, 5);
    const raidDashboard = { openRisks: file.risks.filter((risk) => risk.status === "open" || risk.status === "monitoring").length, highRisks: file.risks.filter((risk) => risk.status !== "closed" && risk.status !== "mitigated" && (risk.probability === "high" || risk.impact === "high")).length, openIssues: file.issues.filter((issue) => issue.status === "open" || issue.status === "investigating").length, criticalIssues: file.issues.filter((issue) => issue.severity === "critical" && issue.status !== "resolved" && issue.status !== "closed").length, invalidatedAssumptions: file.assumptions.filter((assumption) => assumption.status === "invalidated").length };
    const calculatedProjectHealth = calculateProjectHealth(file, today);
    const calculatedWorkstreamHealth = file.workstreams.map((workstream) => ({ workstream, health: calculateWorkstreamHealth(file, workstream, today) }));
    const statusCounts = calculatedWorkstreamHealth.reduce<Record<RagStatus, number>>(
      (counts, { health }) => ({ ...counts, [health.status]: counts[health.status] + 1 }),
      { not_set: 0, green: 0, amber: 0, red: 0 },
    );

    return (
      <div className="grid gap-6" id="dashboard">
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Weekly review</p>
              <h3 className="mt-2 text-2xl font-bold">Dashboard</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Review milestone attention, upcoming dates, workstream health, open actions, recent decisions, and the executive summary from the current local project file.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800" onClick={createNewProject} type="button">Create New Project</button>
              <button className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50" onClick={() => fileInputRef.current?.click()} type="button">Open .pmgov File</button>
            </div>
          </div>
          <p className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-900">Your project data is stored only in the file you open or save.</p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-xl font-bold">Calculated project health</h3>
              <p className={`mt-3 inline-flex rounded-full border px-4 py-2 text-sm font-bold uppercase ${statusTone(calculatedProjectHealth.status)}`}>{statusLabel(calculatedProjectHealth.status)}</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">Mode: {statusLabel(calculatedProjectHealth.mode)}{calculatedProjectHealth.mode === "manual" ? ` override (auto would be ${statusLabel(calculatedProjectHealth.calculatedStatus)})` : ""}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Health mode<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateProject({ healthMode: event.target.value as HealthMode })} value={file.project.healthMode ?? "auto"}>{healthModes.map((mode) => <option key={mode} value={mode}>{statusLabel(mode)}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700">Manual override<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" disabled={(file.project.healthMode ?? "auto") === "auto"} onChange={(event) => updateProject({ status: event.target.value as RagStatus })} value={file.project.status}>{projectStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
            </div>
          </div>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">{calculatedProjectHealth.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6"><h3 className="text-xl font-bold">RAID dashboard</h3><dl className="mt-4 grid gap-3 md:grid-cols-5">{[["Open Risks", raidDashboard.openRisks], ["High Risks", raidDashboard.highRisks], ["Open Issues", raidDashboard.openIssues], ["Critical Issues", raidDashboard.criticalIssues], ["Invalidated Assumptions", raidDashboard.invalidatedAssumptions]].map(([label, value]) => <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3" key={label as string}><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-2 text-2xl font-bold">{value}</dd></div>)}</dl></section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h3 className="text-xl font-bold">Milestones requiring attention</h3>
          {attentionMilestones.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No milestones currently meet the dashboard attention rules.</p> : (
            <div className="mt-4 grid gap-3">{attentionMilestones.map(({ milestone, stage, workstream, reasons, daysUntilPlanned }) => <article className="rounded-2xl border border-slate-200 p-4" key={milestone.id}><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><h4 className="font-bold">{milestone.name}</h4><p className="mt-1 text-sm text-slate-600">{workstream?.name ?? "Unassigned workstream"} · {stage?.name ?? "Unassigned stage"}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusTone(milestone.status)}`}>{statusLabel(milestone.status)}</span></div><p className="mt-3 text-sm text-slate-700">{reasons.join("; ")}.</p><p className="mt-2 text-xs font-semibold text-slate-500">Planned {milestone.plannedDate} · {formatDateDistance(daysUntilPlanned)} · {formatVariance(milestone)}</p></article>)}</div>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-6"><h3 className="text-xl font-bold">Upcoming milestones</h3>{upcomingMilestones.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No upcoming incomplete milestones are scheduled.</p> : <div className="mt-4 space-y-3">{upcomingMilestones.map(({ milestone, workstream, daysUntilPlanned }) => <div className="rounded-2xl bg-slate-50 p-4" key={milestone.id}><p className="font-semibold">{milestone.name}</p><p className="mt-1 text-sm text-slate-600">{workstream?.name ?? "Unassigned workstream"} · {milestone.plannedDate} · {formatDateDistance(daysUntilPlanned)}</p></div>)}</div>}</section>
          <section className="rounded-3xl border border-slate-200 bg-white p-6"><h3 className="text-xl font-bold">Calculated workstream health</h3>{file.workstreams.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No workstreams yet. Add workstreams to see health distribution.</p> : <><dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{projectStatuses.map((status) => <div className={`rounded-2xl border p-3 ${statusTone(status)}`} key={status}><dt className="text-xs font-bold uppercase">{statusLabel(status)}</dt><dd className="mt-2 text-2xl font-bold">{statusCounts[status]}</dd></div>)}</dl><div className="mt-4 space-y-3">{calculatedWorkstreamHealth.map(({ workstream, health }) => <div className="rounded-2xl bg-slate-50 p-3 text-sm" key={workstream.id}><p className="flex justify-between gap-3"><span className="font-semibold">{workstream.name}</span><span className={`rounded-full border px-2 py-0.5 text-xs font-bold uppercase ${statusTone(health.status)}`}>{statusLabel(health.status)}</span></p><p className="mt-1 text-xs font-semibold text-slate-600">Mode: {statusLabel(health.mode)}{health.mode === "manual" ? ` override (auto would be ${statusLabel(health.calculatedStatus)})` : ""}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">{health.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul></div>)}</div></>}</section>
          <section className="rounded-3xl border border-slate-200 bg-white p-6"><h3 className="text-xl font-bold">Open dependencies</h3>{openDependencies.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No open dependencies.</p> : <div className="mt-4 space-y-3">{openDependencies.slice(0, 8).map((dependency) => <div className="rounded-2xl bg-slate-50 p-4" key={dependency.id}><p className="font-semibold">{dependency.title}</p><p className="mt-1 text-sm text-slate-600">Owner: {dependency.owner || "Unassigned"} · Due {dependency.dueDate} ({formatDateDistance(daysBetween(today, dependency.dueDate))}) · {statusLabel(dependency.status)}</p></div>)}</div>}</section>
          <section className="rounded-3xl border border-slate-200 bg-white p-6"><h3 className="text-xl font-bold">Blocked dependencies</h3>{blockedDependencies.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No blocked dependencies.</p> : <div className="mt-4 space-y-3">{blockedDependencies.map((dependency) => <div className="rounded-2xl bg-red-50 p-4" key={dependency.id}><p className="font-semibold">{dependency.title}</p><p className="mt-1 text-sm text-red-800">Owner: {dependency.owner || "Unassigned"} · Due {dependency.dueDate}</p></div>)}</div>}</section>
          <section className="rounded-3xl border border-slate-200 bg-white p-6"><h3 className="text-xl font-bold">Overdue dependencies</h3>{overdueDependencies.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No overdue dependencies.</p> : <div className="mt-4 space-y-3">{overdueDependencies.map((dependency) => <div className="rounded-2xl bg-red-50 p-4" key={dependency.id}><p className="font-semibold">{dependency.title}</p><p className="mt-1 text-sm text-red-800">{formatDateDistance(daysBetween(today, dependency.dueDate))} · {statusLabel(dependency.status)}</p></div>)}</div>}</section>
          <section className="rounded-3xl border border-slate-200 bg-white p-6"><h3 className="text-xl font-bold">Open actions</h3>{openActions.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No open or overdue actions.</p> : <div className="mt-4 space-y-3">{openActions.map(({ action, daysUntilDue }) => <div className="rounded-2xl bg-slate-50 p-4" key={action.id}><p className="font-semibold">{action.description}</p><p className="mt-1 text-sm text-slate-600">Owner: {action.owner || "Unassigned"} · {action.dueDate ? formatDateDistance(daysUntilDue) : "No due date"} · {statusLabel(action.status)}</p><p className="mt-1 text-sm font-semibold text-slate-700">{formatLinkedContext(file, "action", action.id)}</p></div>)}</div>}</section>
          <section className="rounded-3xl border border-slate-200 bg-white p-6"><h3 className="text-xl font-bold">Recent decisions</h3>{recentDecisions.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No decisions captured yet.</p> : <div className="mt-4 space-y-3">{recentDecisions.map((decision) => <div className="rounded-2xl bg-slate-50 p-4" key={decision.id}><p className="font-semibold">{decision.title}</p><p className="mt-1 text-sm text-slate-600">{decision.decisionDate} · {decision.decisionMaker || "Decision maker not set"}</p><p className="mt-1 text-sm font-semibold text-slate-700">{formatLinkedContext(file, "decision", decision.id)}</p><p className="mt-2 text-sm text-slate-700">{decision.decisionText}</p></div>)}</div>}</section>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h3 className="text-xl font-bold">Executive summary</h3>
          {file.project.executiveSummary ? <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{file.project.executiveSummary}</p> : <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No executive summary has been entered for this project.</p>}
        </section>
      </div>
    );
  }


  function getTimelineMilestones(file: PmgovFile, today = todayIsoDate()): TimelineMilestone[] {
    return file.milestones.map((milestone) => {
      const context = getMilestoneContext(file, milestone);
      const daysUntilPlanned = daysBetween(today, milestone.plannedDate);
      const daysUntilForecast = daysBetween(today, milestone.forecastDate);
      const isComplete = milestone.status === "complete";
      const isLate = !isComplete && (daysUntilForecast !== null ? daysUntilForecast < 0 : daysUntilPlanned !== null && daysUntilPlanned < 0);
      const isDueSoon = !isComplete && (daysUntilForecast !== null ? daysUntilForecast >= 0 && daysUntilForecast <= 30 : daysUntilPlanned !== null && daysUntilPlanned >= 0 && daysUntilPlanned <= 30);

      return { milestone, ...context, daysUntilPlanned, daysUntilForecast, isLate, isDueSoon, isComplete };
    });
  }

  function compareTimelineMilestones(a: TimelineMilestone, b: TimelineMilestone) {
    if (timelineSortOption === "Forecast Date") {
      return (a.milestone.forecastDate ?? "9999-12-31").localeCompare(b.milestone.forecastDate ?? "9999-12-31") || a.milestone.plannedDate.localeCompare(b.milestone.plannedDate);
    }

    if (timelineSortOption === "Status") {
      return a.milestone.status.localeCompare(b.milestone.status) || a.milestone.plannedDate.localeCompare(b.milestone.plannedDate);
    }

    if (timelineSortOption === "Workstream") {
      return (a.workstream?.name ?? "Unassigned workstream").localeCompare(b.workstream?.name ?? "Unassigned workstream") || (a.stage?.name ?? "Unassigned stage").localeCompare(b.stage?.name ?? "Unassigned stage") || a.milestone.plannedDate.localeCompare(b.milestone.plannedDate);
    }

    return a.milestone.plannedDate.localeCompare(b.milestone.plannedDate);
  }

  function timelineCardTone(item: TimelineMilestone) {
    if (item.isComplete) {
      return "border-green-300 bg-green-50";
    }

    if (item.milestone.status === "red" || item.isLate) {
      return "border-red-300 bg-red-50";
    }

    if (item.milestone.status === "amber") {
      return "border-amber-300 bg-amber-50";
    }

    if (item.isDueSoon) {
      return "border-blue-300 bg-blue-50";
    }

    return "border-slate-200 bg-white";
  }

  function renderTimelineWorkspace(file: PmgovFile) {
    const timelineItems = getTimelineMilestones(file)
      .filter((item) => timelineStatusFilter === "all" || item.milestone.status === timelineStatusFilter)
      .filter((item) => timelineWorkstreamFilter === "all" || item.workstream?.id === timelineWorkstreamFilter)
      .filter((item) => {
        if (timelineDueWindowFilter === "Overdue") {
          return item.isLate;
        }
        if (timelineDueWindowFilter === "Next 30 days") {
          return item.isDueSoon;
        }
        if (timelineDueWindowFilter === "Completed") {
          return item.isComplete;
        }
        return true;
      })
      .sort(compareTimelineMilestones);
    const groupedWorkstreams = [...file.workstreams]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((workstream) => ({
        workstream,
        stages: file.stages
          .filter((stage) => stage.workstreamId === workstream.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((stage) => ({ stage, milestones: timelineItems.filter((item) => item.stage?.id === stage.id) }))
          .filter((stageGroup) => stageGroup.milestones.length > 0),
      }))
      .filter((workstreamGroup) => workstreamGroup.stages.length > 0);
    const unassignedMilestones = timelineItems.filter((item) => !item.workstream || !item.stage);

    return (
      <section className="space-y-6" id="timeline">
        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Timeline</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h3 className="text-2xl font-bold">Project roadmap</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Read-only view of milestones grouped by workstream and stage, with date risk and status highlights.</p></div><div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600 md:grid-cols-5"><span className="rounded-full border border-red-300 bg-red-50 px-3 py-2 text-red-800">Late / Red</span><span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800">Amber</span><span className="rounded-full border border-green-300 bg-green-50 px-3 py-2 text-green-800">Complete</span><span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-2 text-blue-800">Next 30 days</span><span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-700">On track</span></div></div>
        </div>

        <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">Status<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => setTimelineStatusFilter(event.target.value as MilestoneStatus | "all")} value={timelineStatusFilter}><option value="all">All statuses</option>{milestoneStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Workstream<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => setTimelineWorkstreamFilter(event.target.value)} value={timelineWorkstreamFilter}><option value="all">All workstreams</option>{[...file.workstreams].sort((a, b) => a.sortOrder - b.sortOrder).map((workstream) => <option key={workstream.id} value={workstream.id}>{workstream.name}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Due window<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => setTimelineDueWindowFilter(event.target.value as DueWindowFilter)} value={timelineDueWindowFilter}>{dueWindowOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Sort by<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => setTimelineSortOption(event.target.value as TimelineSortOption)} value={timelineSortOption}>{timelineSortOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        </div>

        {file.milestones.length === 0 ? <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">Create workstreams, stages and milestones to populate the timeline.</p> : timelineItems.length === 0 ? <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">No milestones match the current timeline filters.</p> : <div className="space-y-6">{groupedWorkstreams.map(({ workstream, stages }) => <section className="rounded-3xl border border-slate-200 bg-white p-6" key={workstream.id}><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Workstream</p><h4 className="mt-1 text-xl font-bold">{workstream.name}</h4></div><span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusTone(workstream.status)}`}>{statusLabel(workstream.status)}</span></div><div className="mt-5 space-y-5">{stages.map(({ stage, milestones }) => <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5" key={stage.id}><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Stage</p><h5 className="mt-1 text-lg font-bold">{stage.name}</h5></div><span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusTone(stage.status ?? "not_started")}`}>{statusLabel(stage.status ?? "not_started")}</span></div><div className="mt-4 grid gap-4">{milestones.map((item) => <article className={`rounded-2xl border p-4 ${timelineCardTone(item)}`} key={item.milestone.id}><div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><h6 className="text-lg font-bold">{item.milestone.name}</h6><p className="mt-1 text-sm text-slate-600">{workstream.name} · {stage.name}</p></div><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusTone(item.milestone.status)}`}>{statusLabel(item.milestone.status)}</span>{item.isLate ? <span className="rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-bold uppercase text-red-800">Late</span> : null}{item.isDueSoon ? <span className="rounded-full border border-blue-300 bg-white px-3 py-1 text-xs font-bold uppercase text-blue-800">Next 30 days</span> : null}</div></div><dl className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4"><div><dt className="font-semibold text-slate-500">Planned Date</dt><dd className="mt-1 font-bold">{item.milestone.plannedDate}</dd></div><div><dt className="font-semibold text-slate-500">Forecast Date</dt><dd className="mt-1 font-bold">{item.milestone.forecastDate ?? "Not set"}</dd></div><div><dt className="font-semibold text-slate-500">Actual Date</dt><dd className="mt-1 font-bold">{item.milestone.actualDate ?? "Not set"}</dd></div><div><dt className="font-semibold text-slate-500">Variance</dt><dd className="mt-1 font-bold">{formatVariance(item.milestone)}</dd></div><div><dt className="font-semibold text-slate-500">Status</dt><dd className="mt-1 font-bold capitalize">{statusLabel(item.milestone.status)}</dd></div><div><dt className="font-semibold text-slate-500">Owner</dt><dd className="mt-1 font-bold">{file.project.projectManager || "Project Manager"}</dd></div><div className="md:col-span-2"><dt className="font-semibold text-slate-500">Commentary</dt><dd className="mt-1 whitespace-pre-wrap text-slate-700">{item.milestone.commentary || "No commentary"}</dd></div></dl></article>)}</div></div>)}</div></section>)}{unassignedMilestones.length > 0 ? <section className="rounded-3xl border border-slate-200 bg-white p-6"><h4 className="text-xl font-bold">Unassigned milestones</h4><div className="mt-4 grid gap-4">{unassignedMilestones.map((item) => <article className={`rounded-2xl border p-4 ${timelineCardTone(item)}`} key={item.milestone.id}><h6 className="text-lg font-bold">{item.milestone.name}</h6><p className="mt-2 text-sm text-slate-600">{item.workstream?.name ?? "Unassigned workstream"} · {item.stage?.name ?? "Unassigned stage"}</p><p className="mt-3 text-sm font-semibold text-slate-700">Planned {item.milestone.plannedDate} · Forecast {item.milestone.forecastDate ?? "Not set"} · {formatVariance(item.milestone)}</p></article>)}</div></section> : null}</div>}
      </section>
    );
  }


  function parseTags(value: string) {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function addNote() {
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      title: "New note",
      type: "general",
      date: todayIsoDate(),
      content: "",
      tags: [],
      createdAt: now,
      updatedAt: now,
    };

    mutateProjectFile((current) => ({ ...current, notes: [note, ...current.notes] }), "Note created.");
  }

  function updateNote(id: string, patch: Partial<Pick<Note, "title" | "type" | "date" | "content" | "tags">>) {
    mutateProjectFile(
      (current) => ({
        ...current,
        notes: current.notes.map((note) => (note.id === id ? { ...note, ...patch, updatedAt: new Date().toISOString() } : note)),
      }),
      "Note updated.",
    );
  }

  function deleteNote(note: Note) {
    if (!window.confirm(`Delete note "${note.title}"? This cannot be undone.`)) {
      return;
    }

    mutateProjectFile((current) => ({ ...current, notes: current.notes.filter((item) => item.id !== note.id) }), "Note deleted.");
  }

  function renderNotebookWorkspace(file: PmgovFile) {
    const availableTags = Array.from(new Set(file.notes.flatMap((note) => note.tags ?? []))).sort((a, b) => a.localeCompare(b));
    const normalizedSearch = noteSearchQuery.trim().toLowerCase();
    const filteredNotes = [...file.notes]
      .filter((note) => noteTypeFilter === "all" || note.type === noteTypeFilter)
      .filter((note) => noteTagFilter === "all" || (note.tags ?? []).includes(noteTagFilter))
      .filter((note) => !normalizedSearch || note.title.toLowerCase().includes(normalizedSearch) || note.content.toLowerCase().includes(normalizedSearch))
      .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));

    return (
      <section className="space-y-6" id="notebook">
        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Notebook</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-2xl font-bold">Project notes</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Capture meeting notes, workshop notes, and general project context directly in the local .pmgov file.</p>
            </div>
            <button className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800" onClick={addNote} type="button">Create Note</button>
          </div>
        </div>

        <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">Search title/content<input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => setNoteSearchQuery(event.target.value)} placeholder="Search notes" value={noteSearchQuery} /></label>
          <label className="text-sm font-medium text-slate-700">Type<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => setNoteTypeFilter(event.target.value as NoteType | "all")} value={noteTypeFilter}><option value="all">All types</option>{noteTypes.map((type) => <option key={type} value={type}>{statusLabel(type)}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Tag<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => setNoteTagFilter(event.target.value)} value={noteTagFilter}><option value="all">All tags</option>{availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></label>
        </div>

        {file.notes.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">No notes captured yet. Create a note to record meeting outcomes, workshops or project context.</p>
        ) : filteredNotes.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">No notes match the current search and filters.</p>
        ) : (
          <div className="grid gap-5">{filteredNotes.map((note) => <article className="rounded-3xl border border-slate-200 bg-white p-5" key={note.id}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium text-slate-700 xl:col-span-2">Title <span className="text-red-600" aria-label="required">*</span><input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateNote(note.id, { title: event.target.value })} value={note.title} /></label><label className="text-sm font-medium text-slate-700">Type<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateNote(note.id, { type: event.target.value as NoteType })} value={note.type}>{noteTypes.map((type) => <option key={type} value={type}>{statusLabel(type)}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Date<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateNote(note.id, { date: event.target.value })} type="date" value={note.date} /></label><label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">Content<textarea className="mt-2 min-h-40 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateNote(note.id, { content: event.target.value })} value={note.content} /></label><label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-3">Tags<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateNote(note.id, { tags: parseTags(event.target.value) })} placeholder="Comma-separated tags" value={(note.tags ?? []).join(", ")} /></label><button className="self-end rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700" onClick={() => deleteNote(note)} type="button">Delete Note</button><dl className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600 md:col-span-2 xl:col-span-4 md:grid-cols-2"><div><dt className="font-bold uppercase tracking-[0.18em] text-slate-500">Created At</dt><dd className="mt-1">{formatReportGeneratedAt(note.createdAt)}</dd></div><div><dt className="font-bold uppercase tracking-[0.18em] text-slate-500">Updated At</dt><dd className="mt-1">{formatReportGeneratedAt(note.updatedAt)}</dd></div></dl></div></article>)}</div>
        )}
      </section>
    );
  }


  function getDependencyContext(file: PmgovFile, dependency: Dependency) {
    return {
      sourceWorkstream: file.workstreams.find((item) => item.id === dependency.sourceWorkstreamId),
      sourceMilestone: dependency.sourceMilestoneId ? file.milestones.find((item) => item.id === dependency.sourceMilestoneId) : undefined,
      targetWorkstream: file.workstreams.find((item) => item.id === dependency.targetWorkstreamId),
      targetMilestone: dependency.targetMilestoneId ? file.milestones.find((item) => item.id === dependency.targetMilestoneId) : undefined,
    };
  }

  function isDependencyOverdue(dependency: Dependency) {
    const daysUntilDue = daysBetween(todayIsoDate(), dependency.dueDate);
    return dependency.status !== "resolved" && daysUntilDue !== null && daysUntilDue < 0;
  }

  function addDependency() {
    const firstWorkstreamId = projectFile?.workstreams[0]?.id ?? "";
    const dependency: Dependency = {
      id: crypto.randomUUID(),
      title: "New dependency",
      description: "",
      sourceWorkstreamId: firstWorkstreamId,
      sourceMilestoneId: undefined,
      targetWorkstreamId: firstWorkstreamId,
      targetMilestoneId: undefined,
      owner: "",
      dueDate: todayIsoDate(),
      status: "open",
      commentary: "",
    };

    mutateProjectFile((current) => ({ ...current, dependencies: [...current.dependencies, dependency] }), "Dependency created.");
  }

  function updateDependency(id: string, patch: Partial<Dependency>) {
    mutateProjectFile((current) => ({ ...current, dependencies: current.dependencies.map((dependency) => (dependency.id === id ? { ...dependency, ...patch } : dependency)) }), "Dependency updated.");
  }

  function deleteDependency(dependency: Dependency) {
    if (!window.confirm(`Delete dependency "${dependency.title}"? This cannot be undone.`)) {
      return;
    }

    mutateProjectFile((current) => ({ ...current, dependencies: current.dependencies.filter((item) => item.id !== dependency.id) }), "Dependency deleted.");
  }

  function renderDependencyMilestoneOptions(file: PmgovFile, workstreamId: string, selectedId?: string) {
    const stageIds = new Set(file.stages.filter((stage) => stage.workstreamId === workstreamId).map((stage) => stage.id));
    const milestones = file.milestones.filter((milestone) => stageIds.has(milestone.stageId));
    const selectedMissing = selectedId && !milestones.some((milestone) => milestone.id === selectedId);

    return <>{selectedMissing ? <option value={selectedId}>Deleted or unavailable item</option> : null}{milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.name}</option>)}</>;
  }

  function renderDependenciesWorkspace(file: PmgovFile) {
    const normalizedSearch = dependencySearchQuery.trim().toLowerCase();
    const filteredDependencies = [...file.dependencies]
      .filter((dependency) => dependencyStatusFilter === "all" || dependency.status === dependencyStatusFilter)
      .filter((dependency) => dependencyWorkstreamFilter === "all" || dependency.sourceWorkstreamId === dependencyWorkstreamFilter || dependency.targetWorkstreamId === dependencyWorkstreamFilter)
      .filter((dependency) => !normalizedSearch || dependency.title.toLowerCase().includes(normalizedSearch))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));

    return (
      <section className="space-y-6" id="dependencies">
        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Dependencies</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h3 className="text-2xl font-bold">Delivery dependencies</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Track delivery hand-offs and blockers between source and target workstreams and optional milestones.</p></div><button className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800" onClick={addDependency} type="button">Create Dependency</button></div>
        </div>
        <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">Search title<input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => setDependencySearchQuery(event.target.value)} placeholder="Search dependencies" value={dependencySearchQuery} /></label>
          <label className="text-sm font-medium text-slate-700">Status<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => setDependencyStatusFilter(event.target.value as DependencyStatus | "all")} value={dependencyStatusFilter}><option value="all">All statuses</option>{dependencyStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Workstream<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => setDependencyWorkstreamFilter(event.target.value)} value={dependencyWorkstreamFilter}><option value="all">All workstreams</option>{file.workstreams.map((workstream) => <option key={workstream.id} value={workstream.id}>{workstream.name}</option>)}</select></label>
        </div>
        {file.dependencies.length === 0 ? <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">No dependencies captured yet.</p> : filteredDependencies.length === 0 ? <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">No dependencies match the current filters.</p> : <div className="grid gap-5">{filteredDependencies.map((dependency) => {
          const context = getDependencyContext(file, dependency);
          const overdue = isDependencyOverdue(dependency);
          return <article className={`rounded-3xl border p-5 ${dependency.status === "blocked" || overdue ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`} key={dependency.id}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium text-slate-700 xl:col-span-2">Title <span className="text-red-600" aria-label="required">*</span><input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDependency(dependency.id, { title: event.target.value })} value={dependency.title} /></label><label className="text-sm font-medium text-slate-700">Owner<input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDependency(dependency.id, { owner: event.target.value })} value={dependency.owner} /></label><label className="text-sm font-medium text-slate-700">Due Date<input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDependency(dependency.id, { dueDate: event.target.value })} type="date" value={dependency.dueDate} /></label><label className="text-sm font-medium text-slate-700">Status<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDependency(dependency.id, { status: event.target.value as DependencyStatus })} value={dependency.status}>{dependencyStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><div className="rounded-2xl bg-white p-3 text-sm"><span className="font-semibold text-slate-500">Due</span><span className={`mt-1 block font-bold ${overdue ? "text-red-800" : "text-slate-900"}`}>{formatDateDistance(daysBetween(todayIsoDate(), dependency.dueDate))}</span></div><button className="self-end rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700" onClick={() => deleteDependency(dependency)} type="button">Delete Dependency</button><label className="text-sm font-medium text-slate-700">Source Workstream<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDependency(dependency.id, { sourceWorkstreamId: event.target.value, sourceMilestoneId: undefined })} value={dependency.sourceWorkstreamId}><option value="">Select source workstream</option>{dependency.sourceWorkstreamId && !context.sourceWorkstream ? <option value={dependency.sourceWorkstreamId}>Deleted or unavailable item</option> : null}{file.workstreams.map((workstream) => <option key={workstream.id} value={workstream.id}>{workstream.name}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Source Milestone<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDependency(dependency.id, { sourceMilestoneId: optionalDate(event.target.value) })} value={dependency.sourceMilestoneId ?? ""}><option value="">No source milestone</option>{renderDependencyMilestoneOptions(file, dependency.sourceWorkstreamId, dependency.sourceMilestoneId)}</select></label><label className="text-sm font-medium text-slate-700">Target Workstream<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDependency(dependency.id, { targetWorkstreamId: event.target.value, targetMilestoneId: undefined })} value={dependency.targetWorkstreamId}><option value="">Select target workstream</option>{dependency.targetWorkstreamId && !context.targetWorkstream ? <option value={dependency.targetWorkstreamId}>Deleted or unavailable item</option> : null}{file.workstreams.map((workstream) => <option key={workstream.id} value={workstream.id}>{workstream.name}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Target Milestone<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDependency(dependency.id, { targetMilestoneId: optionalDate(event.target.value) })} value={dependency.targetMilestoneId ?? ""}><option value="">No target milestone</option>{renderDependencyMilestoneOptions(file, dependency.targetWorkstreamId, dependency.targetMilestoneId)}</select></label><label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">Description<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDependency(dependency.id, { description: event.target.value })} value={dependency.description} /></label><label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">Commentary<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDependency(dependency.id, { commentary: event.target.value })} value={dependency.commentary ?? ""} /></label></div></article>;
        })}</div>}
      </section>
    );
  }


  function isActionOverdue(action: ActionItem) {
    return action.status !== "completed" && action.status !== "cancelled" && daysBetween(todayIsoDate(), action.dueDate) !== null && (daysBetween(todayIsoDate(), action.dueDate) ?? 0) < 0;
  }

  function addAction() {
    const action: ActionItem = { id: crypto.randomUUID(), description: "New action", owner: "", dueDate: todayIsoDate(), status: "open", commentary: "" };
    mutateProjectFile((current) => ({ ...current, actions: [...current.actions, action] }), "Action created.");
  }

  function updateAction(id: string, patch: Partial<ActionItem>) {
    mutateProjectFile((current) => ({ ...current, actions: current.actions.map((action) => (action.id === id ? { ...action, ...patch } : action)) }), "Action updated.");
  }

  function updateGovernanceLink(sourceType: GovernanceSourceType, sourceId: string, targetType: DeliveryLinkTarget, targetId: string) {
    mutateProjectFile((current) => ({ ...current, links: setGovernanceLink(current.links, sourceType, sourceId, targetType, targetId) }), "Governance link updated.");
  }

  function renderDeliveryContextFields(sourceType: GovernanceSourceType, sourceId: string) {
    const context = projectFile ? getDeliveryContext(projectFile, sourceType, sourceId) : undefined;

    return (
      <>
        <label className="text-sm font-medium text-slate-700">Linked Workstream<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateGovernanceLink(sourceType, sourceId, "workstream", event.target.value)} value={context?.workstreamId ?? ""}><option value="">No linked workstream</option>{context?.workstreamId && !context.workstream ? <option value={context.workstreamId}>Deleted or unavailable item</option> : null}{projectFile?.workstreams.map((workstream) => <option key={workstream.id} value={workstream.id}>{workstream.name}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Linked Stage<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateGovernanceLink(sourceType, sourceId, "stage", event.target.value)} value={context?.stageId ?? ""}><option value="">No linked stage</option>{context?.stageId && !context.stage ? <option value={context.stageId}>Deleted or unavailable item</option> : null}{projectFile?.stages.map((stage) => { const workstream = projectFile.workstreams.find((item) => item.id === stage.workstreamId); return <option key={stage.id} value={stage.id}>{workstream?.name ?? "Deleted or unavailable item"} / {stage.name}</option>; })}</select></label>
        <label className="text-sm font-medium text-slate-700">Linked Milestone<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateGovernanceLink(sourceType, sourceId, "milestone", event.target.value)} value={context?.milestoneId ?? ""}><option value="">No linked milestone</option>{context?.milestoneId && !context.milestone ? <option value={context.milestoneId}>Deleted or unavailable item</option> : null}{projectFile?.milestones.map((milestone) => { const stage = projectFile.stages.find((item) => item.id === milestone.stageId); const workstream = stage ? projectFile.workstreams.find((item) => item.id === stage.workstreamId) : undefined; return <option key={milestone.id} value={milestone.id}>{workstream?.name ?? "Deleted or unavailable item"} / {stage?.name ?? "Deleted or unavailable item"} / {milestone.name}</option>; })}</select></label>
        {sourceType === "decision" ? <label className="text-sm font-medium text-slate-700">Linked Action<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateGovernanceLink(sourceType, sourceId, "action", event.target.value)} value={context?.actionId ?? ""}><option value="">No linked action</option>{context?.actionId && !context.action ? <option value={context.actionId}>Deleted or unavailable item</option> : null}{projectFile?.actions.map((action) => <option key={action.id} value={action.id}>{action.description}</option>)}</select></label> : null}
      </>
    );
  }

  function deleteAction(action: ActionItem) {
    if (!window.confirm(`Delete action "${action.description}"? This cannot be undone.`)) {
      return;
    }

    mutateProjectFile((current) => ({ ...current, actions: current.actions.filter((item) => item.id !== action.id) }), "Action deleted.");
  }

  function addDecision() {
    const decision: Decision = { id: crypto.randomUUID(), title: "New decision", context: "", decisionText: "", decisionMaker: "", decisionDate: todayIsoDate(), impact: "low", evidenceLinks: [] };
    mutateProjectFile((current) => ({ ...current, decisions: [...current.decisions, decision] }), "Decision created.");
  }

  function updateDecision(id: string, patch: Partial<Decision>) {
    mutateProjectFile((current) => ({ ...current, decisions: current.decisions.map((decision) => (decision.id === id ? { ...decision, ...patch } : decision)) }), "Decision updated.");
  }

  function updateDecisionEvidenceLinks(id: string, value: string) {
    updateDecision(id, { evidenceLinks: value.split("\n").map((link) => link.trim()).filter(Boolean) });
  }

  function deleteDecision(decision: Decision) {
    if (!window.confirm(`Delete decision "${decision.title}"? This cannot be undone.`)) {
      return;
    }

    mutateProjectFile((current) => ({ ...current, decisions: current.decisions.filter((item) => item.id !== decision.id) }), "Decision deleted.");
  }

  function renderGovernanceWorkspace(file: PmgovFile) {
    const sortedActions = [...file.actions].sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"));
    const sortedDecisions = [...file.decisions].sort((a, b) => b.decisionDate.localeCompare(a.decisionDate));

    return (
      <section className="space-y-6" id="governance">
        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Governance</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-2xl font-bold">Actions and decisions</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Capture governance actions and formal decisions directly in the local .pmgov file. Save and reopen the file to preserve these records.</p>
            </div>
            <div className="flex rounded-2xl bg-slate-100 p-1">
              {(["Actions", "Decisions"] as const).map((tab) => (
                <button className={`rounded-xl px-4 py-2 text-sm font-bold ${activeGovernanceTab === tab ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`} key={tab} onClick={() => setActiveGovernanceTab(tab)} type="button">{tab}</button>
              ))}
            </div>
          </div>
        </div>

        {activeGovernanceTab === "Actions" ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3"><div><h4 className="text-xl font-bold">Actions</h4><p className="mt-1 text-sm text-slate-600">Overdue actions are highlighted when their due date is in the past and their status is not completed or cancelled.</p></div><button className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white" onClick={addAction} type="button">Create Action</button></div>
            {sortedActions.length === 0 ? <p className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No actions captured yet.</p> : <div className="mt-5 space-y-4">{sortedActions.map((action) => {
              const overdue = isActionOverdue(action);
              return <article className={`rounded-3xl border p-5 ${overdue ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`} key={action.id}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium text-slate-700 xl:col-span-2">Description<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateAction(action.id, { description: event.target.value })} value={action.description} /></label><label className="text-sm font-medium text-slate-700">Owner<input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateAction(action.id, { owner: event.target.value })} value={action.owner} /></label><label className="text-sm font-medium text-slate-700">Due Date<input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateAction(action.id, { dueDate: optionalDate(event.target.value) })} type="date" value={action.dueDate ?? ""} /></label><label className="text-sm font-medium text-slate-700">Status<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateAction(action.id, { status: event.target.value as ActionStatus })} value={action.status}>{actionStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><div className="rounded-2xl bg-white p-3 text-sm"><span className="font-semibold text-slate-500">Due</span><span className={`mt-1 block font-bold ${overdue ? "text-red-800" : "text-slate-900"}`}>{action.dueDate ? formatDateDistance(daysBetween(todayIsoDate(), action.dueDate)) : "No due date"}</span></div><button className="self-end rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700" onClick={() => deleteAction(action)} type="button">Delete Action</button><p className="rounded-2xl bg-white p-3 text-sm font-semibold text-slate-700 md:col-span-2 xl:col-span-4">{formatLinkedContext(file, "action", action.id)}</p>{renderDeliveryContextFields("action", action.id)}<label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">Commentary<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateAction(action.id, { commentary: event.target.value })} value={action.commentary ?? ""} /></label></div></article>;
            })}</div>}
          </section>
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3"><div><h4 className="text-xl font-bold">Decisions</h4><p className="mt-1 text-sm text-slate-600">Record decision context, decision text, accountable maker, impact, and evidence links.</p></div><button className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white" onClick={addDecision} type="button">Create Decision</button></div>
            {sortedDecisions.length === 0 ? <p className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No decisions captured yet.</p> : <div className="mt-5 space-y-4">{sortedDecisions.map((decision) => <article className="rounded-3xl border border-slate-200 bg-slate-50 p-5" key={decision.id}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium text-slate-700 xl:col-span-2">Title <span className="text-red-600" aria-label="required">*</span><input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDecision(decision.id, { title: event.target.value })} value={decision.title} /></label><label className="text-sm font-medium text-slate-700">Decision Maker<input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDecision(decision.id, { decisionMaker: event.target.value })} value={decision.decisionMaker ?? ""} /></label><label className="text-sm font-medium text-slate-700">Decision Date<input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDecision(decision.id, { decisionDate: event.target.value })} type="date" value={decision.decisionDate} /></label><label className="text-sm font-medium text-slate-700">Impact<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDecision(decision.id, { impact: event.target.value as ImpactLevel })} value={decision.impact ?? "low"}>{impactLevels.map((impact) => <option key={impact} value={impact}>{statusLabel(impact)}</option>)}</select></label><button className="self-end rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700" onClick={() => deleteDecision(decision)} type="button">Delete Decision</button><p className="rounded-2xl bg-white p-3 text-sm font-semibold text-slate-700 md:col-span-2 xl:col-span-4">{formatLinkedContext(file, "decision", decision.id)}</p>{renderDeliveryContextFields("decision", decision.id)}<label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">Context<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDecision(decision.id, { context: event.target.value })} value={decision.context ?? ""} /></label><label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">Decision Text<textarea className="mt-2 min-h-20 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDecision(decision.id, { decisionText: event.target.value })} value={decision.decisionText} /></label><label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">Evidence Links<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDecisionEvidenceLinks(decision.id, event.target.value)} placeholder="One link per line" value={(decision.evidenceLinks ?? []).join("\n")} /></label></div></article>)}</div>}
          </section>
        )}
      </section>
    );
  }


  function getRelatedMilestoneOptions(file: PmgovFile, selectedId?: string) {
    const selectedMissing = selectedId && !file.milestones.some((milestone) => milestone.id === selectedId);
    return <>{selectedMissing ? <option value={selectedId}>Deleted or unavailable item</option> : null}{file.milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.name}</option>)}</>;
  }

  function addRisk() { const risk: Risk = { id: crypto.randomUUID(), title: "New risk", description: "", owner: "", probability: "medium", impact: "medium", mitigation: "", status: "open" }; mutateProjectFile((current) => ({ ...current, risks: [...current.risks, risk] }), "Risk created."); }
  function updateRisk(id: string, patch: Partial<Risk>) { mutateProjectFile((current) => ({ ...current, risks: current.risks.map((risk) => (risk.id === id ? { ...risk, ...patch } : risk)) }), "Risk updated."); }
  function deleteRisk(risk: Risk) { if (window.confirm(`Delete risk "${risk.title}"? This cannot be undone.`)) mutateProjectFile((current) => ({ ...current, risks: current.risks.filter((item) => item.id !== risk.id) }), "Risk deleted."); }
  function addAssumption() { const assumption: Assumption = { id: crypto.randomUUID(), title: "New assumption", description: "", owner: "", validationDate: todayIsoDate(), status: "active" }; mutateProjectFile((current) => ({ ...current, assumptions: [...current.assumptions, assumption] }), "Assumption created."); }
  function updateAssumption(id: string, patch: Partial<Assumption>) { mutateProjectFile((current) => ({ ...current, assumptions: current.assumptions.map((assumption) => (assumption.id === id ? { ...assumption, ...patch } : assumption)) }), "Assumption updated."); }
  function deleteAssumption(assumption: Assumption) { if (window.confirm(`Delete assumption "${assumption.title}"? This cannot be undone.`)) mutateProjectFile((current) => ({ ...current, assumptions: current.assumptions.filter((item) => item.id !== assumption.id) }), "Assumption deleted."); }
  function addIssue() { const issue: Issue = { id: crypto.randomUUID(), title: "New issue", description: "", owner: "", severity: "medium", status: "open", targetResolutionDate: todayIsoDate() }; mutateProjectFile((current) => ({ ...current, issues: [...current.issues, issue] }), "Issue created."); }
  function updateIssue(id: string, patch: Partial<Issue>) { mutateProjectFile((current) => ({ ...current, issues: current.issues.map((issue) => (issue.id === id ? { ...issue, ...patch } : issue)) }), "Issue updated."); }
  function deleteIssue(issue: Issue) { if (window.confirm(`Delete issue "${issue.title}"? This cannot be undone.`)) mutateProjectFile((current) => ({ ...current, issues: current.issues.filter((item) => item.id !== issue.id) }), "Issue deleted."); }

  function renderRaidWorkspace(file: PmgovFile) {
    const query = raidSearchQuery.trim().toLowerCase();
    const matches = (title: string, status: string) => (!query || title.toLowerCase().includes(query)) && (raidStatusFilter === "all" || status === raidStatusFilter);
    const risks = file.risks.filter((risk) => matches(risk.title, risk.status));
    const assumptions = file.assumptions.filter((assumption) => matches(assumption.title, assumption.status));
    const issues = file.issues.filter((issue) => matches(issue.title, issue.status));
    const statusOptions = activeRaidTab === "Risks" ? riskStatuses : activeRaidTab === "Assumptions" ? assumptionStatuses : issueStatuses;
    return <section className="space-y-6" id="raid"><div className="rounded-3xl border border-slate-200 bg-white p-6"><p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">RAID</p><div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h3 className="text-2xl font-bold">RAID workspace</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Manage formal risks, assumptions, and issues in the local .pmgov file.</p></div><div className="flex rounded-2xl bg-slate-100 p-1">{(["Risks", "Assumptions", "Issues"] as const).map((tab) => <button className={`rounded-xl px-4 py-2 text-sm font-bold ${activeRaidTab === tab ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`} key={tab} onClick={() => { setActiveRaidTab(tab); setRaidStatusFilter("all"); }} type="button">{tab}</button>)}</div></div></div><div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-3"><label className="text-sm font-medium text-slate-700">Search title<input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => setRaidSearchQuery(event.target.value)} placeholder="Search RAID records" value={raidSearchQuery} /></label><label className="text-sm font-medium text-slate-700">Status<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => setRaidStatusFilter(event.target.value)} value={raidStatusFilter}><option value="all">All statuses</option>{statusOptions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><button className="self-end rounded-2xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white" onClick={activeRaidTab === "Risks" ? addRisk : activeRaidTab === "Assumptions" ? addAssumption : addIssue} type="button">Create {activeRaidTab.slice(0, -1)}</button></div>{activeRaidTab === "Risks" ? <div className="grid gap-5">{risks.map((risk) => <article className="rounded-3xl border border-slate-200 bg-white p-5" key={risk.id}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium text-slate-700 xl:col-span-2">Title<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateRisk(risk.id, { title: e.target.value })} value={risk.title} /></label><label className="text-sm font-medium text-slate-700">Owner<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateRisk(risk.id, { owner: e.target.value })} value={risk.owner} /></label><label className="text-sm font-medium text-slate-700">Status<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateRisk(risk.id, { status: e.target.value as RiskStatus })} value={risk.status}>{riskStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Probability<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateRisk(risk.id, { probability: e.target.value as RaidLevel })} value={risk.probability}>{raidLevels.map((level) => <option key={level} value={level}>{statusLabel(level)}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Impact<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateRisk(risk.id, { impact: e.target.value as RaidLevel })} value={risk.impact}>{raidLevels.map((level) => <option key={level} value={level}>{statusLabel(level)}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Related Workstream<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateRisk(risk.id, { relatedWorkstreamId: optionalDate(e.target.value) })} value={risk.relatedWorkstreamId ?? ""}><option value="">None</option>{file.workstreams.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Related Milestone<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateRisk(risk.id, { relatedMilestoneId: optionalDate(e.target.value) })} value={risk.relatedMilestoneId ?? ""}><option value="">None</option>{getRelatedMilestoneOptions(file, risk.relatedMilestoneId)}</select></label><label className="text-sm font-medium text-slate-700 md:col-span-2">Description<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateRisk(risk.id, { description: e.target.value })} value={risk.description} /></label><label className="text-sm font-medium text-slate-700 md:col-span-2">Mitigation<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateRisk(risk.id, { mitigation: e.target.value })} value={risk.mitigation} /></label><button className="rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700" onClick={() => deleteRisk(risk)} type="button">Delete Risk</button></div></article>)}</div> : activeRaidTab === "Assumptions" ? <div className="grid gap-5">{assumptions.map((assumption) => <article className="rounded-3xl border border-slate-200 bg-white p-5" key={assumption.id}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium text-slate-700 xl:col-span-2">Title<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateAssumption(assumption.id, { title: e.target.value })} value={assumption.title} /></label><label className="text-sm font-medium text-slate-700">Owner<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateAssumption(assumption.id, { owner: e.target.value })} value={assumption.owner} /></label><label className="text-sm font-medium text-slate-700">Validation Date<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateAssumption(assumption.id, { validationDate: e.target.value })} type="date" value={assumption.validationDate} /></label><label className="text-sm font-medium text-slate-700">Status<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateAssumption(assumption.id, { status: e.target.value as AssumptionStatus })} value={assumption.status}>{assumptionStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Related Workstream<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateAssumption(assumption.id, { relatedWorkstreamId: optionalDate(e.target.value) })} value={assumption.relatedWorkstreamId ?? ""}><option value="">None</option>{file.workstreams.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">Description<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateAssumption(assumption.id, { description: e.target.value })} value={assumption.description} /></label><button className="rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700" onClick={() => deleteAssumption(assumption)} type="button">Delete Assumption</button></div></article>)}</div> : <div className="grid gap-5">{issues.map((issue) => <article className="rounded-3xl border border-slate-200 bg-white p-5" key={issue.id}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium text-slate-700 xl:col-span-2">Title<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateIssue(issue.id, { title: e.target.value })} value={issue.title} /></label><label className="text-sm font-medium text-slate-700">Owner<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateIssue(issue.id, { owner: e.target.value })} value={issue.owner} /></label><label className="text-sm font-medium text-slate-700">Severity<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateIssue(issue.id, { severity: e.target.value as IssueSeverity })} value={issue.severity}>{issueSeverities.map((severity) => <option key={severity} value={severity}>{statusLabel(severity)}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Status<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateIssue(issue.id, { status: e.target.value as IssueStatus })} value={issue.status}>{issueStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Target Resolution Date<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateIssue(issue.id, { targetResolutionDate: e.target.value })} type="date" value={issue.targetResolutionDate} /></label><label className="text-sm font-medium text-slate-700">Related Workstream<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateIssue(issue.id, { relatedWorkstreamId: optionalDate(e.target.value) })} value={issue.relatedWorkstreamId ?? ""}><option value="">None</option>{file.workstreams.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Related Milestone<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateIssue(issue.id, { relatedMilestoneId: optionalDate(e.target.value) })} value={issue.relatedMilestoneId ?? ""}><option value="">None</option>{getRelatedMilestoneOptions(file, issue.relatedMilestoneId)}</select></label><label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">Description<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(e) => updateIssue(issue.id, { description: e.target.value })} value={issue.description} /></label><button className="rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700" onClick={() => deleteIssue(issue)} type="button">Delete Issue</button></div></article>)}</div>}</section>;
  }

  function buildExecutiveReportData(file: PmgovFile, generatedAt = reportGeneratedAt): ExecutiveReportData {
    const today = todayIsoDate();
    const attentionMilestones = file.milestones
      .map((milestone) => ({ milestone, ...getMilestoneContext(file, milestone), daysUntilPlanned: daysBetween(today, milestone.plannedDate), reasons: getMilestoneAttentionReasons(milestone, today) }))
      .filter((item) => item.reasons.length > 0)
      .sort((a, b) => (a.daysUntilPlanned ?? Number.MAX_SAFE_INTEGER) - (b.daysUntilPlanned ?? Number.MAX_SAFE_INTEGER));
    const upcomingMilestones = file.milestones
      .filter((milestone) => milestone.status !== "complete")
      .map((milestone) => ({ milestone, ...getMilestoneContext(file, milestone), daysUntilPlanned: daysBetween(today, milestone.plannedDate) }))
      .filter((item) => item.daysUntilPlanned !== null && item.daysUntilPlanned >= 0)
      .sort((a, b) => (a.daysUntilPlanned ?? Number.MAX_SAFE_INTEGER) - (b.daysUntilPlanned ?? Number.MAX_SAFE_INTEGER))
      .slice(0, 8);
    const openActions = file.actions
      .filter((action) => action.status !== "completed" && action.status !== "cancelled")
      .map((action) => ({ action, daysUntilDue: daysBetween(today, action.dueDate) }))
      .sort((a, b) => (a.daysUntilDue ?? Number.MAX_SAFE_INTEGER) - (b.daysUntilDue ?? Number.MAX_SAFE_INTEGER));
    const dependencies = [...file.dependencies].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const blockedDependencies = dependencies.filter((dependency) => dependency.status === "blocked");
    const topRisks = [...file.risks].filter((risk) => risk.status !== "closed" && risk.status !== "mitigated").slice(0, 5);
    const openIssues = [...file.issues].filter((issue) => issue.status !== "resolved" && issue.status !== "closed");
    const recentDecisions = [...file.decisions].sort((a, b) => b.decisionDate.localeCompare(a.decisionDate)).slice(0, 8);
    const workstreamHealth = file.workstreams.map((workstream) => ({ workstream, health: calculateWorkstreamHealth(file, workstream, today) }));
    const projectHealth = calculateProjectHealth(file, today);

    return { generatedAt, attentionMilestones, upcomingMilestones, openActions, dependencies, blockedDependencies, topRisks, openIssues, recentDecisions, workstreamHealth, projectHealth };
  }

  function formatReportGeneratedAt(value: string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  function buildExecutiveReportMarkdown(file: PmgovFile, data: ExecutiveReportData) {
    const lineItems = (items: string[], emptyText: string) => (items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : emptyText);
    const workstreamItems = data.workstreamHealth.map(({ workstream, health }) => `- ${workstream.name}: ${statusLabel(health.status)} (${statusLabel(health.mode)}${health.mode === "manual" ? ` override; auto would be ${statusLabel(health.calculatedStatus)}` : ""}) — ${health.reasons.join("; ")}${workstream.commentary ? ` — ${workstream.commentary}` : ""}`);
    const attentionItems = data.attentionMilestones.map(({ milestone, workstream, stage, reasons }) => `- ${milestone.name} (${workstream?.name ?? "Unassigned workstream"} / ${stage?.name ?? "Unassigned stage"}): ${reasons?.join("; ") ?? "Requires attention"}.`);
    const upcomingItems = data.upcomingMilestones.map(({ milestone, workstream, daysUntilPlanned }) => `- ${milestone.plannedDate} (${formatDateDistance(daysUntilPlanned)}): ${milestone.name} — ${workstream?.name ?? "Unassigned workstream"}.`);
    const actionItems = data.openActions.map(({ action, daysUntilDue }) => `- ${action.description} — Owner: ${action.owner || "Unassigned"}; Due: ${action.dueDate ? `${action.dueDate} (${formatDateDistance(daysUntilDue)})` : "No due date"}; Status: ${statusLabel(action.status)}; Context: ${formatLinkedContext(file, "action", action.id)}.`);
    const raidSummaryItems = [`Open Risks: ${file.risks.filter((risk) => risk.status === "open" || risk.status === "monitoring").length}`, `High Risks: ${file.risks.filter((risk) => risk.status !== "closed" && risk.status !== "mitigated" && (risk.probability === "high" || risk.impact === "high")).length}`, `Open Issues: ${data.openIssues.length}`, `Critical Issues: ${file.issues.filter((issue) => issue.severity === "critical" && issue.status !== "resolved" && issue.status !== "closed").length}`, `Invalidated Assumptions: ${file.assumptions.filter((assumption) => assumption.status === "invalidated").length}`];
    const topRiskItems = data.topRisks.map((risk) => `- ${risk.title} — Owner: ${risk.owner || "Unassigned"}; Probability: ${statusLabel(risk.probability)}; Impact: ${statusLabel(risk.impact)}; Status: ${statusLabel(risk.status)}.`);
    const openIssueItems = data.openIssues.map((issue) => `- ${issue.title} — Owner: ${issue.owner || "Unassigned"}; Severity: ${statusLabel(issue.severity)}; Target: ${issue.targetResolutionDate}; Status: ${statusLabel(issue.status)}.`);
    const dependencyItems = data.dependencies.map((dependency) => `- ${dependency.title} — Owner: ${dependency.owner || "Unassigned"}; Due: ${dependency.dueDate} (${formatDateDistance(daysBetween(todayIsoDate(), dependency.dueDate))}); Status: ${statusLabel(dependency.status)}.`);
    const blockedDependencyItems = data.blockedDependencies.map((dependency) => `- ${dependency.title} — Owner: ${dependency.owner || "Unassigned"}; Due: ${dependency.dueDate}; ${dependency.commentary || "No commentary"}.`);
    const decisionItems = data.recentDecisions.map((decision) => `- ${decision.decisionDate}: ${decision.title}${decision.decisionMaker ? ` — ${decision.decisionMaker}` : ""}; Context: ${formatLinkedContext(file, "decision", decision.id)}. ${decision.decisionText}`);

    return `# Executive Status Report — ${file.project.name}\n\nGenerated: ${formatReportGeneratedAt(data.generatedAt)}\n\n## Project Overview\n${file.project.description || "No project description captured."}\n\nSponsor: ${file.project.sponsor || "Not set"}\nProject Manager: ${file.project.projectManager || "Not set"}\nStart Date: ${file.project.startDate || "Not set"}\nTarget Date: ${file.project.targetDate || "Not set"}\n\n## Overall Status\nProject health: ${statusLabel(data.projectHealth.status)} (${statusLabel(data.projectHealth.mode)}${data.projectHealth.mode === "manual" ? ` override; auto would be ${statusLabel(data.projectHealth.calculatedStatus)}` : ""})
Health reasons: ${data.projectHealth.reasons.join("; ")}\n\n## Key Risks / Attention Items\n${lineItems(attentionItems, "No milestones requiring attention.")}\n\n## Milestone Outlook\n${lineItems(upcomingItems, "No upcoming milestones captured.")}\n\n## Workstream Health\n${lineItems(workstreamItems, "No workstreams captured.")}\n\n## Open Actions\n${lineItems(actionItems, "No open actions captured.")}\n\n## RAID Summary\n${lineItems(raidSummaryItems, "No RAID records captured.")}\n\n## Top Risks\n${lineItems(topRiskItems, "No open risks captured.")}\n\n## Open Issues\n${lineItems(openIssueItems, "No open issues captured.")}\n\n## Dependency Summary\n${lineItems(dependencyItems, "No dependencies captured.")}\n\n## Blocked Dependencies\n${lineItems(blockedDependencyItems, "No blocked dependencies captured.")}\n\n## Recent Decisions\n${lineItems(decisionItems, "No recent decisions captured.")}\n\n## Executive Summary\n${file.project.executiveSummary || "No executive summary has been entered for this project."}\n`;
  }

  async function copyReportMarkdown(file: PmgovFile, data: ExecutiveReportData) {
    await navigator.clipboard.writeText(buildExecutiveReportMarkdown(file, data));
    setMessage({ tone: "success", text: "Executive status report copied as Markdown." });
  }

  function regenerateReport() {
    setReportGeneratedAt(new Date().toISOString());
    setMessage({ tone: "success", text: "Executive status report regenerated from current in-memory project data." });
  }

  function renderExecutiveReportWorkspace(file: PmgovFile) {
    const reportData = buildExecutiveReportData(file);
    const workstreamCounts = reportData.workstreamHealth.reduce<Record<RagStatus, number>>((counts, { health }) => ({ ...counts, [health.status]: counts[health.status] + 1 }), { not_set: 0, green: 0, amber: 0, red: 0 });
    const workstreamHealth = file.workstreams.length === 0 ? "No workstreams captured." : `${workstreamCounts.green} green, ${workstreamCounts.amber} amber, ${workstreamCounts.red} red, ${workstreamCounts.not_set} not set.`;

    return (
      <section className="space-y-6" id="reports">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 print:hidden">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Reports</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-2xl font-bold">Executive Status Report</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Preview a read-only weekly report generated from the current local .pmgov data in browser memory. Reports are not saved as separate entities yet.</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">Generated {formatReportGeneratedAt(reportData.generatedAt)}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:border-blue-300 hover:bg-blue-50" onClick={regenerateReport} type="button">Regenerate</button>
              <button className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:border-blue-300 hover:bg-blue-50" onClick={() => copyReportMarkdown(file, reportData)} type="button">Copy Markdown</button>
              <button className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800" onClick={() => window.print()} type="button">Print</button>
            </div>
          </div>
        </div>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none" aria-label="Executive Status Report preview">
          <h2 className="text-3xl font-bold">Executive Status Report</h2>
          <p className="mt-2 text-sm text-slate-600">{file.project.name} · Generated {formatReportGeneratedAt(reportData.generatedAt)}</p>
          <div className="mt-6 grid gap-5">
            <section><h3 className="text-xl font-bold">Project Overview</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{file.project.description || "No project description captured."}</p><dl className="mt-3 grid gap-2 text-sm md:grid-cols-2"><div><dt className="font-semibold text-slate-500">Sponsor</dt><dd>{file.project.sponsor || "Not set"}</dd></div><div><dt className="font-semibold text-slate-500">Project Manager</dt><dd>{file.project.projectManager || "Not set"}</dd></div><div><dt className="font-semibold text-slate-500">Start Date</dt><dd>{file.project.startDate || "Not set"}</dd></div><div><dt className="font-semibold text-slate-500">Target Date</dt><dd>{file.project.targetDate || "Not set"}</dd></div></dl></section>
            <section><h3 className="text-xl font-bold">Calculated Project Health</h3><p className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-bold capitalize ${statusTone(reportData.projectHealth.status)}`}>{statusLabel(reportData.projectHealth.status)}</p><p className="mt-2 text-sm font-semibold text-slate-700">Mode: {statusLabel(reportData.projectHealth.mode)}{reportData.projectHealth.mode === "manual" ? ` override (auto would be ${statusLabel(reportData.projectHealth.calculatedStatus)})` : ""}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">{reportData.projectHealth.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></section>
            <section><h3 className="text-xl font-bold">Key Risks / Attention Items</h3>{reportData.attentionMilestones.length === 0 ? <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No milestones requiring attention.</p> : <div className="mt-3 space-y-3">{reportData.attentionMilestones.map(({ milestone, workstream, stage, reasons }) => <div className="rounded-2xl bg-slate-50 p-4" key={milestone.id}><p className="font-semibold">{milestone.name}</p><p className="mt-1 text-sm text-slate-600">{workstream?.name ?? "Unassigned workstream"} · {stage?.name ?? "Unassigned stage"}</p><p className="mt-2 text-sm text-slate-700">{reasons?.join("; ")}.</p></div>)}</div>}</section>
            <section><h3 className="text-xl font-bold">Milestone Outlook</h3>{reportData.upcomingMilestones.length === 0 ? <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No upcoming milestones captured.</p> : <div className="mt-3 space-y-3">{reportData.upcomingMilestones.map(({ milestone, workstream, daysUntilPlanned }) => <div className="rounded-2xl bg-slate-50 p-4" key={milestone.id}><p className="font-semibold">{milestone.name}</p><p className="mt-1 text-sm text-slate-600">{milestone.plannedDate} · {formatDateDistance(daysUntilPlanned)} · {workstream?.name ?? "Unassigned workstream"}</p></div>)}</div>}</section>
            <section><h3 className="text-xl font-bold">Workstream Health</h3><p className="mt-2 text-sm text-slate-700">{workstreamHealth}</p>{reportData.workstreamHealth.length > 0 ? <div className="mt-3 space-y-2">{reportData.workstreamHealth.map(({ workstream, health }) => <div className="rounded-2xl bg-slate-50 p-3 text-sm" key={workstream.id}><p><strong>{workstream.name}</strong>: {statusLabel(health.status)} ({statusLabel(health.mode)}{health.mode === "manual" ? ` override; auto would be ${statusLabel(health.calculatedStatus)}` : ""})</p><ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">{health.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>{workstream.commentary ? <p className="mt-2 text-slate-700">{workstream.commentary}</p> : null}</div>)}</div> : null}</section>
            <section><h3 className="text-xl font-bold">Open Actions</h3>{reportData.openActions.length === 0 ? <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No open actions captured.</p> : <div className="mt-3 space-y-3">{reportData.openActions.map(({ action, daysUntilDue }) => <div className="rounded-2xl bg-slate-50 p-4" key={action.id}><p className="font-semibold">{action.description}</p><p className="mt-1 text-sm text-slate-600">Owner: {action.owner || "Unassigned"} · {action.dueDate ? formatDateDistance(daysUntilDue) : "No due date"} · {statusLabel(action.status)}</p><p className="mt-1 text-sm font-semibold text-slate-700">{formatLinkedContext(file, "action", action.id)}</p></div>)}</div>}</section>
            <section><h3 className="text-xl font-bold">RAID Summary</h3><dl className="mt-3 grid gap-3 md:grid-cols-5">{[["Open Risks", file.risks.filter((risk) => risk.status === "open" || risk.status === "monitoring").length], ["High Risks", file.risks.filter((risk) => risk.status !== "closed" && risk.status !== "mitigated" && (risk.probability === "high" || risk.impact === "high")).length], ["Open Issues", reportData.openIssues.length], ["Critical Issues", file.issues.filter((issue) => issue.severity === "critical" && issue.status !== "resolved" && issue.status !== "closed").length], ["Invalidated Assumptions", file.assumptions.filter((assumption) => assumption.status === "invalidated").length]].map(([label, value]) => <div className="rounded-2xl bg-slate-50 p-3" key={label as string}><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-xl font-bold">{value}</dd></div>)}</dl></section><section><h3 className="text-xl font-bold">Top Risks</h3>{reportData.topRisks.length === 0 ? <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No open risks captured.</p> : <div className="mt-3 space-y-3">{reportData.topRisks.map((risk) => <div className="rounded-2xl bg-slate-50 p-4" key={risk.id}><p className="font-semibold">{risk.title}</p><p className="mt-1 text-sm text-slate-600">Owner: {risk.owner || "Unassigned"} · Probability {statusLabel(risk.probability)} · Impact {statusLabel(risk.impact)} · {statusLabel(risk.status)}</p></div>)}</div>}</section><section><h3 className="text-xl font-bold">Open Issues</h3>{reportData.openIssues.length === 0 ? <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No open issues captured.</p> : <div className="mt-3 space-y-3">{reportData.openIssues.map((issue) => <div className="rounded-2xl bg-slate-50 p-4" key={issue.id}><p className="font-semibold">{issue.title}</p><p className="mt-1 text-sm text-slate-600">Owner: {issue.owner || "Unassigned"} · Severity {statusLabel(issue.severity)} · Target {issue.targetResolutionDate} · {statusLabel(issue.status)}</p></div>)}</div>}</section>
            <section><h3 className="text-xl font-bold">Dependency Summary</h3>{reportData.dependencies.length === 0 ? <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No dependencies captured.</p> : <div className="mt-3 space-y-3">{reportData.dependencies.map((dependency) => <div className="rounded-2xl bg-slate-50 p-4" key={dependency.id}><p className="font-semibold">{dependency.title}</p><p className="mt-1 text-sm text-slate-600">Owner: {dependency.owner || "Unassigned"} · Due {dependency.dueDate} · {statusLabel(dependency.status)}</p></div>)}</div>}</section>
            <section><h3 className="text-xl font-bold">Blocked Dependencies</h3>{reportData.blockedDependencies.length === 0 ? <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No blocked dependencies captured.</p> : <div className="mt-3 space-y-3">{reportData.blockedDependencies.map((dependency) => <div className="rounded-2xl bg-red-50 p-4" key={dependency.id}><p className="font-semibold">{dependency.title}</p><p className="mt-1 text-sm text-red-800">Owner: {dependency.owner || "Unassigned"} · Due {dependency.dueDate}</p><p className="mt-2 text-sm text-slate-700">{dependency.commentary || "No commentary"}</p></div>)}</div>}</section>
            <section><h3 className="text-xl font-bold">Recent Decisions</h3>{reportData.recentDecisions.length === 0 ? <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No recent decisions captured.</p> : <div className="mt-3 space-y-3">{reportData.recentDecisions.map((decision) => <div className="rounded-2xl bg-slate-50 p-4" key={decision.id}><p className="font-semibold">{decision.title}</p><p className="mt-1 text-sm text-slate-600">{decision.decisionDate} · {decision.decisionMaker || "Decision maker not set"}</p><p className="mt-1 text-sm font-semibold text-slate-700">{formatLinkedContext(file, "decision", decision.id)}</p><p className="mt-2 text-sm text-slate-700">{decision.decisionText}</p></div>)}</div>}</section>
            <section><h3 className="text-xl font-bold">Executive Summary</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{file.project.executiveSummary || "No executive summary has been entered for this project."}</p></section>
          </div>
        </article>
      </section>
    );
  }

  function renderPlaceholder(view: NavigationItem) {
    const descriptions: Record<NavigationItem, string> = {
      Dashboard: "Milestones requiring attention, upcoming milestones, workstream health, open actions, recent decisions, and the executive summary will appear here.",
      Workstreams: "Manage workstream lists, stages, and milestones grouped by stage here in a later task.",
      Timeline: "A roadmap-style timeline grouped by workstream and stage will appear here.",
      Notebook: "Meeting, workshop, and general governance notes will be captured here.",
      Governance: "Actions and decisions tabs will appear here when governance extraction is implemented.",
      Dependencies: "Delivery dependency tracking and blocker summaries will appear here.",
      RAID: "Risks, assumptions, and issues will be managed here.",
      Reports: "Executive status report generation, copy Markdown, and printable output will appear here.",
      Settings: "Project-level settings and file information will appear here.",
    };

    return (
      <section className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6" id={formatNavId(view)}>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">{view}</p>
        <h3 className="mt-3 text-2xl font-bold">{view} workspace</h3>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{descriptions[view]}</p>
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      {!projectFile ? (
        <section className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-12">
          <div className="w-full rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm md:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-blue-700">PGW</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-6xl">Project Governance Workspace</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Open or create a single local <code className="rounded bg-slate-100 px-1 py-0.5">.pmgov</code> file to manage project governance in browser memory.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800" onClick={createNewProject} type="button">
                Create New Project
              </button>
              <button className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50" onClick={() => fileInputRef.current?.click()} type="button">
                Open .pmgov File
              </button>
            </div>
            <p className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-900">
              Your project data is stored only in the file you open or save.
            </p>
            <p className={`mt-4 rounded-2xl border p-4 text-sm ${message.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-slate-50 text-slate-700"}`} role="status">
              {message.text}
            </p>
            <input accept=".pmgov,application/json" className="hidden" onChange={openProject} ref={fileInputRef} type="file" />
          </div>
        </section>
      ) : (
        <div className="flex min-h-screen">
          <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-5 shadow-sm lg:block">
            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-700">PGW</p>
              <h1 className="mt-2 text-2xl font-bold">Project Governance Workspace</h1>
            </div>
            <nav aria-label="Project workspace sections" className="space-y-2">
              {navigationItems.map((item) => (
                <button
                  className={`block w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${activeView === item ? "bg-blue-700 text-white" : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"}`}
                  key={item}
                  onClick={() => setActiveView(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </nav>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">Local project file</p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight">{projectFile.project.name}</h2>
                  <p className={`mt-1 text-sm font-semibold ${isDirty ? "text-amber-700" : "text-green-700"}`}>{isDirty ? "Unsaved changes — save or Save As to keep them" : "Saved to current browser snapshot"}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50" onClick={() => fileInputRef.current?.click()} type="button">Open</button>
                  <button className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50" onClick={() => saveProject(false)} type="button" aria-describedby="save-help">Save</button>
                  <button className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800" onClick={() => saveProject(true)} type="button">Save As</button>
                  <input accept=".pmgov,application/json" className="hidden" onChange={openProject} ref={fileInputRef} type="file" />
                </div>
                <p id="save-help" className="text-xs text-slate-500">Save downloads a validated .pmgov file to your device; no cloud copy is kept.</p>
              </div>
            </header>

            <div className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
              <nav aria-label="Mobile project workspace sections" className="flex gap-2 overflow-x-auto">
                {navigationItems.map((item) => (
                  <button className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${activeView === item ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700"}`} key={item} onClick={() => setActiveView(item)} type="button">
                    {item}
                  </button>
                ))}
              </nav>
            </div>

            <div className="flex-1 p-6">
              <p className={`mb-6 rounded-2xl border p-4 text-sm ${message.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : message.tone === "success" ? "border-green-200 bg-green-50 text-green-800" : "border-blue-200 bg-blue-50 text-blue-800"}`} role="status">
                {message.text}
              </p>

              <div className="mb-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">File</p><p className="mt-3 text-lg font-bold">{openedFileName ?? "No file saved"}</p></div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Validation</p><p className={`mt-3 text-lg font-bold ${validation?.success ? "text-green-700" : "text-red-700"}`}>{validation?.success ? "Schema valid" : "Schema invalid"}</p></div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Records</p><p className="mt-3 text-lg font-bold">{countRecords(projectFile).reduce((total, [, count]) => total + count, 0)} total records</p><p className="mt-1 text-xs text-slate-500">{countRecords(projectFile).map(([label, count]) => `${label}: ${count}`).join(" · ")}</p></div>
              </div>

              {activeView === "Dashboard" ? (
                renderDashboard(projectFile)
              ) : activeView === "Workstreams" ? (
                renderWorkstreamsWorkspace(projectFile)
              ) : activeView === "Timeline" ? (
                renderTimelineWorkspace(projectFile)
              ) : activeView === "Notebook" ? (
                renderNotebookWorkspace(projectFile)
              ) : activeView === "Governance" ? (
                renderGovernanceWorkspace(projectFile)
              ) : activeView === "Dependencies" ? (
                renderDependenciesWorkspace(projectFile)
              ) : activeView === "RAID" ? (
                renderRaidWorkspace(projectFile)
              ) : activeView === "Reports" ? (
                renderExecutiveReportWorkspace(projectFile)
              ) : (
                renderPlaceholder(activeView)
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
