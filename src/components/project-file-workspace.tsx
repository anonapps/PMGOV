"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import type { ActionItem, ActionStatus, Decision, ImpactLevel, Milestone, MilestoneStatus, Note, NoteType, PmgovFile, Stage, StageStatus, Workstream, WorkstreamStatus } from "@/types/pmgov";
import {
  buildPmgovFilename,
  createEmptyProjectFile,
  parsePmgovJson,
  preparePmgovForSave,
  serializePmgovFile,
  validatePmgovFile,
} from "@/lib/pmgov";

const navigationItems = ["Dashboard", "Workstreams", "Timeline", "Notebook", "Governance", "Reports", "Settings"] as const;
const workstreamStatuses: WorkstreamStatus[] = ["not_set", "green", "amber", "red", "complete"];
const stageStatuses: StageStatus[] = ["not_started", "in_progress", "complete", "blocked"];
const milestoneStatuses: MilestoneStatus[] = ["not_set", "green", "amber", "red", "complete"];
const actionStatuses: ActionStatus[] = ["open", "in_progress", "completed", "cancelled"];
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
  recentDecisions: Decision[];
  statusCounts: Record<WorkstreamStatus, number>;
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
    ["Links", file.links.length],
    ["Reports", file.reports.length],
  ] as const;
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
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [noteTypeFilter, setNoteTypeFilter] = useState<NoteType | "all">("all");
  const [noteTagFilter, setNoteTagFilter] = useState("all");
  const [timelineStatusFilter, setTimelineStatusFilter] = useState<MilestoneStatus | "all">("all");
  const [timelineWorkstreamFilter, setTimelineWorkstreamFilter] = useState<string>("all");
  const [timelineDueWindowFilter, setTimelineDueWindowFilter] = useState<DueWindowFilter>("All");
  const [timelineSortOption, setTimelineSortOption] = useState<TimelineSortOption>("Planned Date");
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string>(() => new Date().toISOString());
  const [message, setMessage] = useState<Message>({
    tone: "info",
    text: "Create a new local project file or open an existing .pmgov file to begin.",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentSnapshot = useMemo(() => (projectFile ? serializePmgovFile(projectFile) : null), [projectFile]);
  const isDirty = projectFile !== null && currentSnapshot !== lastSavedSnapshot;
  const validation = useMemo(() => (projectFile ? validatePmgovFile(projectFile) : null), [projectFile]);

  function createNewProject() {
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

    if (!selectedFile.name.toLowerCase().endsWith(".pmgov")) {
      setMessage({ tone: "error", text: "Please choose a file with the .pmgov extension." });
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
      setMessage({ tone: "error", text: "Create or open a project before saving." });
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

  function addWorkstream() {
    const workstream: Workstream = {
      id: crypto.randomUUID(),
      name: "New workstream",
      description: "",
      status: "not_set",
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

    if (!window.confirm(`Delete ${workstream.name} and its ${childStages.length} stage(s) and ${childMilestones.length} milestone(s)?`)) {
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

    if (!window.confirm(`Delete ${stage.name} and its ${childMilestones.length} milestone(s)?`)) {
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
    if (!window.confirm(`Delete milestone ${milestone.name}?`)) {
      return;
    }

    mutateProjectFile((current) => ({ ...current, milestones: current.milestones.filter((item) => item.id !== milestone.id) }), "Milestone deleted.");
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
            return (
              <section className="rounded-3xl border border-slate-200 bg-white p-6" id={`workstream-${workstream.id}`} key={workstream.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Selected workstream</p><h3 className="mt-2 text-2xl font-bold">{workstream.name}</h3></div><div className="flex gap-2"><button className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={() => addStage(workstream.id)} type="button">Add stage</button><button className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700" onClick={() => deleteWorkstream(workstream)} type="button">Delete</button></div></div>
                <div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium text-slate-700">Name<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateWorkstream(workstream.id, { name: event.target.value })} value={workstream.name} /></label><label className="text-sm font-medium text-slate-700">Status<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateWorkstream(workstream.id, { status: event.target.value as WorkstreamStatus })} value={workstream.status}>{workstreamStatuses.map((status) => (<option key={status} value={status}>{statusLabel(status)}</option>))}</select></label><label className="text-sm font-medium text-slate-700 md:col-span-2">Description<textarea className="mt-2 min-h-20 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateWorkstream(workstream.id, { description: event.target.value })} value={workstream.description ?? ""} /></label><label className="text-sm font-medium text-slate-700 md:col-span-2">Commentary<textarea className="mt-2 min-h-20 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateWorkstream(workstream.id, { commentary: event.target.value })} value={workstream.commentary ?? ""} /></label></div>
                <div className="mt-6 space-y-4">{stages.length === 0 ? (<p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No stages yet. Add a stage for this workstream.</p>) : stages.map((stage) => {
                  const milestones = file.milestones.filter((milestone) => milestone.stageId === stage.id);
                  return (<div className="rounded-3xl border border-slate-200 bg-slate-50 p-5" key={stage.id}><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="grid flex-1 gap-3 md:grid-cols-2"><label className="text-sm font-medium text-slate-700">Stage name<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateStage(stage.id, { name: event.target.value })} value={stage.name} /></label><label className="text-sm font-medium text-slate-700">Stage status<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateStage(stage.id, { status: event.target.value as StageStatus })} value={stage.status ?? "not_started"}>{stageStatuses.map((status) => (<option key={status} value={status}>{statusLabel(status)}</option>))}</select></label><label className="text-sm font-medium text-slate-700 md:col-span-2">Stage commentary<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateStage(stage.id, { commentary: event.target.value })} value={stage.commentary ?? ""} /></label></div><div className="flex gap-2"><button className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={() => addMilestone(stage.id)} type="button">Add milestone</button><button className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700" onClick={() => deleteStage(stage)} type="button">Delete</button></div></div><div className="mt-4 space-y-3">{milestones.length === 0 ? (<p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">No milestones yet for this stage.</p>) : milestones.map((milestone) => (<div className="rounded-2xl border border-slate-200 bg-white p-4" key={milestone.id}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium text-slate-700 xl:col-span-2">Milestone name<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateMilestone(milestone.id, { name: event.target.value })} value={milestone.name} /></label><label className="text-sm font-medium text-slate-700">Status<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateMilestone(milestone.id, { status: event.target.value as MilestoneStatus })} value={milestone.status}>{milestoneStatuses.map((status) => (<option key={status} value={status}>{statusLabel(status)}</option>))}</select></label><div className="rounded-2xl bg-slate-100 p-3 text-sm"><span className="font-semibold text-slate-500">Variance</span><span className="mt-1 block font-bold text-slate-900">{formatVariance(milestone)}</span></div><label className="text-sm font-medium text-slate-700">Planned date<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateMilestone(milestone.id, { plannedDate: event.target.value })} type="date" value={milestone.plannedDate} /></label><label className="text-sm font-medium text-slate-700">Forecast date<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateMilestone(milestone.id, { forecastDate: optionalDate(event.target.value) })} type="date" value={milestone.forecastDate ?? ""} /></label><label className="text-sm font-medium text-slate-700">Actual date<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateMilestone(milestone.id, { actualDate: optionalDate(event.target.value) })} type="date" value={milestone.actualDate ?? ""} /></label><button className="self-end rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700" onClick={() => deleteMilestone(milestone)} type="button">Delete milestone</button><label className="text-sm font-medium text-slate-700 md:col-span-2">Description<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateMilestone(milestone.id, { description: event.target.value })} value={milestone.description ?? ""} /></label><label className="text-sm font-medium text-slate-700 md:col-span-2">Commentary<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateMilestone(milestone.id, { commentary: event.target.value })} value={milestone.commentary ?? ""} /></label></div></div>))}</div></div>);
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
    const recentDecisions = [...file.decisions].sort((a, b) => b.decisionDate.localeCompare(a.decisionDate)).slice(0, 5);
    const statusCounts = file.workstreams.reduce<Record<WorkstreamStatus, number>>(
      (counts, workstream) => ({ ...counts, [workstream.status]: counts[workstream.status] + 1 }),
      { not_set: 0, green: 0, amber: 0, red: 0, complete: 0 },
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
          <h3 className="text-xl font-bold">Milestones requiring attention</h3>
          {attentionMilestones.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No milestones currently meet the dashboard attention rules.</p> : (
            <div className="mt-4 grid gap-3">{attentionMilestones.map(({ milestone, stage, workstream, reasons, daysUntilPlanned }) => <article className="rounded-2xl border border-slate-200 p-4" key={milestone.id}><div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><h4 className="font-bold">{milestone.name}</h4><p className="mt-1 text-sm text-slate-600">{workstream?.name ?? "Unassigned workstream"} · {stage?.name ?? "Unassigned stage"}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusTone(milestone.status)}`}>{statusLabel(milestone.status)}</span></div><p className="mt-3 text-sm text-slate-700">{reasons.join("; ")}.</p><p className="mt-2 text-xs font-semibold text-slate-500">Planned {milestone.plannedDate} · {formatDateDistance(daysUntilPlanned)} · {formatVariance(milestone)}</p></article>)}</div>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-6"><h3 className="text-xl font-bold">Upcoming milestones</h3>{upcomingMilestones.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No upcoming incomplete milestones are scheduled.</p> : <div className="mt-4 space-y-3">{upcomingMilestones.map(({ milestone, workstream, daysUntilPlanned }) => <div className="rounded-2xl bg-slate-50 p-4" key={milestone.id}><p className="font-semibold">{milestone.name}</p><p className="mt-1 text-sm text-slate-600">{workstream?.name ?? "Unassigned workstream"} · {milestone.plannedDate} · {formatDateDistance(daysUntilPlanned)}</p></div>)}</div>}</section>
          <section className="rounded-3xl border border-slate-200 bg-white p-6"><h3 className="text-xl font-bold">Workstream health</h3>{file.workstreams.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No workstreams yet. Add workstreams to see health distribution.</p> : <><dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">{workstreamStatuses.map((status) => <div className={`rounded-2xl border p-3 ${statusTone(status)}`} key={status}><dt className="text-xs font-bold uppercase">{statusLabel(status)}</dt><dd className="mt-2 text-2xl font-bold">{statusCounts[status]}</dd></div>)}</dl><div className="mt-4 space-y-2">{file.workstreams.map((workstream) => <p className="flex justify-between rounded-2xl bg-slate-50 p-3 text-sm" key={workstream.id}><span className="font-semibold">{workstream.name}</span><span>{statusLabel(workstream.status)}</span></p>)}</div></>}</section>
          <section className="rounded-3xl border border-slate-200 bg-white p-6"><h3 className="text-xl font-bold">Open actions</h3>{openActions.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No open or overdue actions.</p> : <div className="mt-4 space-y-3">{openActions.map(({ action, daysUntilDue }) => <div className="rounded-2xl bg-slate-50 p-4" key={action.id}><p className="font-semibold">{action.description}</p><p className="mt-1 text-sm text-slate-600">Owner: {action.owner || "Unassigned"} · {action.dueDate ? formatDateDistance(daysUntilDue) : "No due date"} · {statusLabel(action.status)}</p></div>)}</div>}</section>
          <section className="rounded-3xl border border-slate-200 bg-white p-6"><h3 className="text-xl font-bold">Recent decisions</h3>{recentDecisions.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No decisions captured yet.</p> : <div className="mt-4 space-y-3">{recentDecisions.map((decision) => <div className="rounded-2xl bg-slate-50 p-4" key={decision.id}><p className="font-semibold">{decision.title}</p><p className="mt-1 text-sm text-slate-600">{decision.decisionDate} · {decision.decisionMaker || "Decision maker not set"}</p><p className="mt-2 text-sm text-slate-700">{decision.decisionText}</p></div>)}</div>}</section>
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
    if (!window.confirm(`Delete note: ${note.title}?`)) {
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
          <div className="grid gap-5">{filteredNotes.map((note) => <article className="rounded-3xl border border-slate-200 bg-white p-5" key={note.id}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium text-slate-700 xl:col-span-2">Title<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateNote(note.id, { title: event.target.value })} value={note.title} /></label><label className="text-sm font-medium text-slate-700">Type<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateNote(note.id, { type: event.target.value as NoteType })} value={note.type}>{noteTypes.map((type) => <option key={type} value={type}>{statusLabel(type)}</option>)}</select></label><label className="text-sm font-medium text-slate-700">Date<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateNote(note.id, { date: event.target.value })} type="date" value={note.date} /></label><label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">Content<textarea className="mt-2 min-h-40 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateNote(note.id, { content: event.target.value })} value={note.content} /></label><label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-3">Tags<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" onChange={(event) => updateNote(note.id, { tags: parseTags(event.target.value) })} placeholder="Comma-separated tags" value={(note.tags ?? []).join(", ")} /></label><button className="self-end rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700" onClick={() => deleteNote(note)} type="button">Delete Note</button><dl className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600 md:col-span-2 xl:col-span-4 md:grid-cols-2"><div><dt className="font-bold uppercase tracking-[0.18em] text-slate-500">Created At</dt><dd className="mt-1">{formatReportGeneratedAt(note.createdAt)}</dd></div><div><dt className="font-bold uppercase tracking-[0.18em] text-slate-500">Updated At</dt><dd className="mt-1">{formatReportGeneratedAt(note.updatedAt)}</dd></div></dl></div></article>)}</div>
        )}
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

  function deleteAction(action: ActionItem) {
    if (!window.confirm(`Delete action: ${action.description}?`)) {
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
    if (!window.confirm(`Delete decision: ${decision.title}?`)) {
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
              return <article className={`rounded-3xl border p-5 ${overdue ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`} key={action.id}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium text-slate-700 xl:col-span-2">Description<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateAction(action.id, { description: event.target.value })} value={action.description} /></label><label className="text-sm font-medium text-slate-700">Owner<input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateAction(action.id, { owner: event.target.value })} value={action.owner} /></label><label className="text-sm font-medium text-slate-700">Due Date<input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateAction(action.id, { dueDate: optionalDate(event.target.value) })} type="date" value={action.dueDate ?? ""} /></label><label className="text-sm font-medium text-slate-700">Status<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateAction(action.id, { status: event.target.value as ActionStatus })} value={action.status}>{actionStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><div className="rounded-2xl bg-white p-3 text-sm"><span className="font-semibold text-slate-500">Due</span><span className={`mt-1 block font-bold ${overdue ? "text-red-800" : "text-slate-900"}`}>{action.dueDate ? formatDateDistance(daysBetween(todayIsoDate(), action.dueDate)) : "No due date"}</span></div><button className="self-end rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700" onClick={() => deleteAction(action)} type="button">Delete Action</button><label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">Commentary<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateAction(action.id, { commentary: event.target.value })} value={action.commentary ?? ""} /></label></div></article>;
            })}</div>}
          </section>
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3"><div><h4 className="text-xl font-bold">Decisions</h4><p className="mt-1 text-sm text-slate-600">Record decision context, decision text, accountable maker, impact, and evidence links.</p></div><button className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white" onClick={addDecision} type="button">Create Decision</button></div>
            {sortedDecisions.length === 0 ? <p className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No decisions captured yet.</p> : <div className="mt-5 space-y-4">{sortedDecisions.map((decision) => <article className="rounded-3xl border border-slate-200 bg-slate-50 p-5" key={decision.id}><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium text-slate-700 xl:col-span-2">Title<input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDecision(decision.id, { title: event.target.value })} value={decision.title} /></label><label className="text-sm font-medium text-slate-700">Decision Maker<input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDecision(decision.id, { decisionMaker: event.target.value })} value={decision.decisionMaker ?? ""} /></label><label className="text-sm font-medium text-slate-700">Decision Date<input className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDecision(decision.id, { decisionDate: event.target.value })} type="date" value={decision.decisionDate} /></label><label className="text-sm font-medium text-slate-700">Impact<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDecision(decision.id, { impact: event.target.value as ImpactLevel })} value={decision.impact ?? "low"}>{impactLevels.map((impact) => <option key={impact} value={impact}>{statusLabel(impact)}</option>)}</select></label><button className="self-end rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700" onClick={() => deleteDecision(decision)} type="button">Delete Decision</button><label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">Context<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDecision(decision.id, { context: event.target.value })} value={decision.context ?? ""} /></label><label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">Decision Text<textarea className="mt-2 min-h-20 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDecision(decision.id, { decisionText: event.target.value })} value={decision.decisionText} /></label><label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-4">Evidence Links<textarea className="mt-2 min-h-16 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" onChange={(event) => updateDecisionEvidenceLinks(decision.id, event.target.value)} placeholder="One link per line" value={(decision.evidenceLinks ?? []).join("\n")} /></label></div></article>)}</div>}
          </section>
        )}
      </section>
    );
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
    const recentDecisions = [...file.decisions].sort((a, b) => b.decisionDate.localeCompare(a.decisionDate)).slice(0, 8);
    const statusCounts = file.workstreams.reduce<Record<WorkstreamStatus, number>>(
      (counts, workstream) => ({ ...counts, [workstream.status]: counts[workstream.status] + 1 }),
      { not_set: 0, green: 0, amber: 0, red: 0, complete: 0 },
    );

    return { generatedAt, attentionMilestones, upcomingMilestones, openActions, recentDecisions, statusCounts };
  }

  function formatReportGeneratedAt(value: string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  function buildExecutiveReportMarkdown(file: PmgovFile, data: ExecutiveReportData) {
    const lineItems = (items: string[], emptyText: string) => (items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : emptyText);
    const workstreamItems = file.workstreams.map((workstream) => `- ${workstream.name}: ${statusLabel(workstream.status)}${workstream.commentary ? ` — ${workstream.commentary}` : ""}`);
    const attentionItems = data.attentionMilestones.map(({ milestone, workstream, stage, reasons }) => `- ${milestone.name} (${workstream?.name ?? "Unassigned workstream"} / ${stage?.name ?? "Unassigned stage"}): ${reasons?.join("; ") ?? "Requires attention"}.`);
    const upcomingItems = data.upcomingMilestones.map(({ milestone, workstream, daysUntilPlanned }) => `- ${milestone.plannedDate} (${formatDateDistance(daysUntilPlanned)}): ${milestone.name} — ${workstream?.name ?? "Unassigned workstream"}.`);
    const actionItems = data.openActions.map(({ action, daysUntilDue }) => `- ${action.description} — Owner: ${action.owner || "Unassigned"}; Due: ${action.dueDate ? `${action.dueDate} (${formatDateDistance(daysUntilDue)})` : "No due date"}; Status: ${statusLabel(action.status)}.`);
    const decisionItems = data.recentDecisions.map((decision) => `- ${decision.decisionDate}: ${decision.title}${decision.decisionMaker ? ` — ${decision.decisionMaker}` : ""}. ${decision.decisionText}`);

    return `# Executive Status Report — ${file.project.name}\n\nGenerated: ${formatReportGeneratedAt(data.generatedAt)}\n\n## Project Overview\n${file.project.description || "No project description captured."}\n\nSponsor: ${file.project.sponsor || "Not set"}\nProject Manager: ${file.project.projectManager || "Not set"}\nStart Date: ${file.project.startDate || "Not set"}\nTarget Date: ${file.project.targetDate || "Not set"}\n\n## Overall Status\nProject status: ${statusLabel(file.project.status)}\n\n## Key Risks / Attention Items\n${lineItems(attentionItems, "No milestones requiring attention.")}\n\n## Milestone Outlook\n${lineItems(upcomingItems, "No upcoming milestones captured.")}\n\n## Workstream Health\n${lineItems(workstreamItems, "No workstreams captured.")}\n\n## Open Actions\n${lineItems(actionItems, "No open actions captured.")}\n\n## Recent Decisions\n${lineItems(decisionItems, "No recent decisions captured.")}\n\n## Executive Summary\n${file.project.executiveSummary || "No executive summary has been entered for this project."}\n`;
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
    const workstreamHealth = file.workstreams.length === 0 ? "No workstreams captured." : `${reportData.statusCounts.green} green, ${reportData.statusCounts.amber} amber, ${reportData.statusCounts.red} red, ${reportData.statusCounts.complete} complete, ${reportData.statusCounts.not_set} not set.`;

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
            <section><h3 className="text-xl font-bold">Overall Status</h3><p className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-bold capitalize ${statusTone(file.project.status)}`}>{statusLabel(file.project.status)}</p></section>
            <section><h3 className="text-xl font-bold">Key Risks / Attention Items</h3>{reportData.attentionMilestones.length === 0 ? <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No milestones requiring attention.</p> : <div className="mt-3 space-y-3">{reportData.attentionMilestones.map(({ milestone, workstream, stage, reasons }) => <div className="rounded-2xl bg-slate-50 p-4" key={milestone.id}><p className="font-semibold">{milestone.name}</p><p className="mt-1 text-sm text-slate-600">{workstream?.name ?? "Unassigned workstream"} · {stage?.name ?? "Unassigned stage"}</p><p className="mt-2 text-sm text-slate-700">{reasons?.join("; ")}.</p></div>)}</div>}</section>
            <section><h3 className="text-xl font-bold">Milestone Outlook</h3>{reportData.upcomingMilestones.length === 0 ? <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No upcoming milestones captured.</p> : <div className="mt-3 space-y-3">{reportData.upcomingMilestones.map(({ milestone, workstream, daysUntilPlanned }) => <div className="rounded-2xl bg-slate-50 p-4" key={milestone.id}><p className="font-semibold">{milestone.name}</p><p className="mt-1 text-sm text-slate-600">{milestone.plannedDate} · {formatDateDistance(daysUntilPlanned)} · {workstream?.name ?? "Unassigned workstream"}</p></div>)}</div>}</section>
            <section><h3 className="text-xl font-bold">Workstream Health</h3><p className="mt-2 text-sm text-slate-700">{workstreamHealth}</p>{file.workstreams.length > 0 ? <div className="mt-3 space-y-2">{file.workstreams.map((workstream) => <p className="rounded-2xl bg-slate-50 p-3 text-sm" key={workstream.id}><strong>{workstream.name}</strong>: {statusLabel(workstream.status)}{workstream.commentary ? ` — ${workstream.commentary}` : ""}</p>)}</div> : null}</section>
            <section><h3 className="text-xl font-bold">Open Actions</h3>{reportData.openActions.length === 0 ? <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No open actions captured.</p> : <div className="mt-3 space-y-3">{reportData.openActions.map(({ action, daysUntilDue }) => <div className="rounded-2xl bg-slate-50 p-4" key={action.id}><p className="font-semibold">{action.description}</p><p className="mt-1 text-sm text-slate-600">Owner: {action.owner || "Unassigned"} · {action.dueDate ? formatDateDistance(daysUntilDue) : "No due date"} · {statusLabel(action.status)}</p></div>)}</div>}</section>
            <section><h3 className="text-xl font-bold">Recent Decisions</h3>{reportData.recentDecisions.length === 0 ? <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No recent decisions captured.</p> : <div className="mt-3 space-y-3">{reportData.recentDecisions.map((decision) => <div className="rounded-2xl bg-slate-50 p-4" key={decision.id}><p className="font-semibold">{decision.title}</p><p className="mt-1 text-sm text-slate-600">{decision.decisionDate} · {decision.decisionMaker || "Decision maker not set"}</p><p className="mt-2 text-sm text-slate-700">{decision.decisionText}</p></div>)}</div>}</section>
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
                  <p className={`mt-1 text-sm font-semibold ${isDirty ? "text-amber-700" : "text-green-700"}`}>{isDirty ? "Unsaved changes" : "Saved"}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50" onClick={() => fileInputRef.current?.click()} type="button">Open</button>
                  <button className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50" onClick={() => saveProject(false)} type="button">Save</button>
                  <button className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800" onClick={() => saveProject(true)} type="button">Save As</button>
                  <input accept=".pmgov,application/json" className="hidden" onChange={openProject} ref={fileInputRef} type="file" />
                </div>
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
                <div className="rounded-3xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Records</p><p className="mt-3 text-lg font-bold">{countRecords(projectFile).reduce((total, [, count]) => total + count, 0)} governance items</p></div>
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
