"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import type {
  Milestone,
  MilestoneStatus,
  PmgovFile,
  Project,
  RagStatus,
  Stage,
  StageStatus,
  Workstream,
  WorkstreamStatus,
} from "@/types/pmgov";
import {
  buildPmgovFilename,
  createEmptyProjectFile,
  parsePmgovJson,
  preparePmgovForSave,
  serializePmgovFile,
  validatePmgovFile,
} from "@/lib/pmgov";

const navigationItems = [
  "Dashboard",
  "Workstreams",
  "Timeline",
  "Notebook",
  "Governance",
  "Reports",
  "Settings",
] as const;
const projectStatuses: RagStatus[] = ["not_set", "green", "amber", "red"];
const workstreamStatuses: WorkstreamStatus[] = ["not_set", "green", "amber", "red", "complete"];
const stageStatuses: StageStatus[] = ["not_started", "in_progress", "complete", "blocked"];
const milestoneStatuses: MilestoneStatus[] = ["not_set", "green", "amber", "red", "complete"];

type NavigationItem = (typeof navigationItems)[number];
type Message = { tone: "success" | "error" | "info"; text: string };

type WorkstreamField = "name" | "description" | "status" | "owner" | "targetDate";
type StageField = "name" | "description" | "status" | "owner" | "targetDate";
type MilestoneField = "name" | "description" | "status" | "owner" | "targetDate" | "plannedDate" | "forecastDate" | "actualDate";

const today = () => new Date().toISOString().slice(0, 10);

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

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
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

function varianceLabel(milestone: Milestone) {
  const comparisonDate = milestone.actualDate || milestone.forecastDate;

  if (!comparisonDate) {
    return "No forecast or actual date";
  }

  const planned = new Date(`${milestone.plannedDate}T00:00:00Z`);
  const comparison = new Date(`${comparisonDate}T00:00:00Z`);
  const days = Math.round((comparison.getTime() - planned.getTime()) / 86_400_000);

  if (days === 0) {
    return "On plan";
  }

  return days > 0 ? `${days} days late` : `${Math.abs(days)} days early`;
}

export function ProjectFileWorkspace() {
  const [projectFile, setProjectFile] = useState<PmgovFile | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);
  const [openedFileName, setOpenedFileName] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<NavigationItem>("Dashboard");
  const [selectedWorkstreamId, setSelectedWorkstreamId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>({
    tone: "info",
    text: "Create a new local project file or open an existing .pmgov file to begin.",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentSnapshot = useMemo(() => (projectFile ? serializePmgovFile(projectFile) : null), [projectFile]);
  const isDirty = projectFile !== null && currentSnapshot !== lastSavedSnapshot;
  const validation = useMemo(() => (projectFile ? validatePmgovFile(projectFile) : null), [projectFile]);
  const selectedWorkstream = projectFile?.workstreams.find((workstream) => workstream.id === selectedWorkstreamId) ?? null;
  const selectedStage = projectFile?.stages.find((stage) => stage.id === selectedStageId) ?? null;
  const selectedWorkstreamStages = useMemo(() => {
    if (!projectFile || !selectedWorkstream) {
      return [];
    }

    return projectFile.stages
      .filter((stage) => stage.workstreamId === selectedWorkstream.id)
      .sort((first, second) => first.sortOrder - second.sortOrder);
  }, [projectFile, selectedWorkstream]);
  const selectedStageMilestones = useMemo(() => {
    if (!projectFile || !selectedStage) {
      return [];
    }

    return projectFile.milestones.filter((milestone) => milestone.stageId === selectedStage.id);
  }, [projectFile, selectedStage]);

  function createNewProject() {
    const nextFile = createEmptyProjectFile();
    setProjectFile(nextFile);
    setLastSavedSnapshot(null);
    setOpenedFileName(null);
    setActiveView("Dashboard");
    setSelectedWorkstreamId(null);
    setSelectedStageId(null);
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

    const firstWorkstream = result.data.workstreams.toSorted((first, second) => first.sortOrder - second.sortOrder)[0];
    const firstStage = firstWorkstream
      ? result.data.stages
          .filter((stage) => stage.workstreamId === firstWorkstream.id)
          .toSorted((first, second) => first.sortOrder - second.sortOrder)[0]
      : null;
    const snapshot = serializePmgovFile(result.data);

    setProjectFile(result.data);
    setLastSavedSnapshot(snapshot);
    setOpenedFileName(selectedFile.name);
    setActiveView("Dashboard");
    setSelectedWorkstreamId(firstWorkstream?.id ?? null);
    setSelectedStageId(firstStage?.id ?? null);
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

  function updateProject<K extends keyof Project>(key: K, value: Project[K]) {
    setProjectFile((current) => (current ? { ...current, project: { ...current.project, [key]: value } } : current));
  }

  function createWorkstream() {
    setProjectFile((current) => {
      if (!current) {
        return current;
      }

      const workstream: Workstream = {
        id: crypto.randomUUID(),
        name: `Workstream ${current.workstreams.length + 1}`,
        description: "",
        status: "not_set",
        owner: "",
        commentary: "",
        sortOrder: current.workstreams.length,
      };

      setSelectedWorkstreamId(workstream.id);
      setSelectedStageId(null);
      setActiveView("Workstreams");
      setMessage({ tone: "success", text: `${workstream.name} created in the local project file.` });
      return { ...current, workstreams: [...current.workstreams, workstream] };
    });
  }

  function updateWorkstream(id: string, field: WorkstreamField, value: string) {
    const nextValue = field === "targetDate" && value === "" ? undefined : value;

    setProjectFile((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        workstreams: current.workstreams.map((workstream) =>
          workstream.id === id ? { ...workstream, [field]: nextValue } : workstream,
        ),
      };
    });
  }

  function deleteWorkstream(id: string) {
    if (!projectFile) {
      return;
    }

    const workstream = projectFile.workstreams.find((item) => item.id === id);
    const stageIds = projectFile.stages.filter((stage) => stage.workstreamId === id).map((stage) => stage.id);
    const milestoneIds = projectFile.milestones
      .filter((milestone) => stageIds.includes(milestone.stageId))
      .map((milestone) => milestone.id);
    const childSummary = `${stageIds.length} stage(s) and ${milestoneIds.length} milestone(s)`;

    if (!window.confirm(`Delete ${workstream?.name ?? "this workstream"} and its ${childSummary}?`)) {
      return;
    }

    setProjectFile({
      ...projectFile,
      workstreams: projectFile.workstreams.filter((item) => item.id !== id),
      stages: projectFile.stages.filter((stage) => stage.workstreamId !== id),
      milestones: projectFile.milestones.filter((milestone) => !stageIds.includes(milestone.stageId)),
      links: projectFile.links.filter(
        (link) =>
          !(link.sourceType === "workstream" && link.sourceId === id) &&
          !(link.targetType === "workstream" && link.targetId === id) &&
          !(link.sourceType === "stage" && stageIds.includes(link.sourceId)) &&
          !(link.targetType === "stage" && stageIds.includes(link.targetId)) &&
          !(link.sourceType === "milestone" && milestoneIds.includes(link.sourceId)) &&
          !(link.targetType === "milestone" && milestoneIds.includes(link.targetId)),
      ),
    });
    setSelectedWorkstreamId((current) => (current === id ? null : current));
    setSelectedStageId((current) => (current && stageIds.includes(current) ? null : current));
    setMessage({ tone: "success", text: `${workstream?.name ?? "Workstream"} deleted locally.` });
  }

  function createStage(workstreamId: string) {
    setProjectFile((current) => {
      if (!current) {
        return current;
      }

      const siblingCount = current.stages.filter((stage) => stage.workstreamId === workstreamId).length;
      const stage: Stage = {
        id: crypto.randomUUID(),
        workstreamId,
        name: `Stage ${siblingCount + 1}`,
        description: "",
        status: "not_started",
        owner: "",
        commentary: "",
        sortOrder: siblingCount,
      };

      setSelectedStageId(stage.id);
      setMessage({ tone: "success", text: `${stage.name} created in the selected workstream.` });
      return { ...current, stages: [...current.stages, stage] };
    });
  }

  function updateStage(id: string, field: StageField, value: string) {
    const nextValue = field === "targetDate" && value === "" ? undefined : value;

    setProjectFile((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        stages: current.stages.map((stage) => (stage.id === id ? { ...stage, [field]: nextValue } : stage)),
      };
    });
  }

  function deleteStage(id: string) {
    if (!projectFile) {
      return;
    }

    const stage = projectFile.stages.find((item) => item.id === id);
    const milestoneIds = projectFile.milestones
      .filter((milestone) => milestone.stageId === id)
      .map((milestone) => milestone.id);

    if (!window.confirm(`Delete ${stage?.name ?? "this stage"} and its ${milestoneIds.length} milestone(s)?`)) {
      return;
    }

    setProjectFile({
      ...projectFile,
      stages: projectFile.stages.filter((item) => item.id !== id),
      milestones: projectFile.milestones.filter((milestone) => milestone.stageId !== id),
      links: projectFile.links.filter(
        (link) =>
          !(link.sourceType === "stage" && link.sourceId === id) &&
          !(link.targetType === "stage" && link.targetId === id) &&
          !(link.sourceType === "milestone" && milestoneIds.includes(link.sourceId)) &&
          !(link.targetType === "milestone" && milestoneIds.includes(link.targetId)),
      ),
    });
    setSelectedStageId((current) => (current === id ? null : current));
    setMessage({ tone: "success", text: `${stage?.name ?? "Stage"} deleted locally.` });
  }

  function createMilestone(stageId: string) {
    setProjectFile((current) => {
      if (!current) {
        return current;
      }

      const siblingCount = current.milestones.filter((milestone) => milestone.stageId === stageId).length;
      const milestone: Milestone = {
        id: crypto.randomUUID(),
        stageId,
        name: `Milestone ${siblingCount + 1}`,
        description: "",
        owner: "",
        targetDate: today(),
        plannedDate: today(),
        status: "not_set",
        commentary: "",
      };

      setMessage({ tone: "success", text: `${milestone.name} created in the selected stage.` });
      return { ...current, milestones: [...current.milestones, milestone] };
    });
  }

  function updateMilestone(id: string, field: MilestoneField, value: string) {
    const optionalDateFields: MilestoneField[] = ["targetDate", "forecastDate", "actualDate"];
    const nextValue = optionalDateFields.includes(field) && value === "" ? undefined : value;

    setProjectFile((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        milestones: current.milestones.map((milestone) =>
          milestone.id === id ? { ...milestone, [field]: nextValue } : milestone,
        ),
      };
    });
  }

  function deleteMilestone(id: string) {
    if (!projectFile) {
      return;
    }

    const milestone = projectFile.milestones.find((item) => item.id === id);

    if (!window.confirm(`Delete ${milestone?.name ?? "this milestone"}?`)) {
      return;
    }

    setProjectFile({
      ...projectFile,
      milestones: projectFile.milestones.filter((item) => item.id !== id),
      links: projectFile.links.filter(
        (link) =>
          !(link.sourceType === "milestone" && link.sourceId === id) &&
          !(link.targetType === "milestone" && link.targetId === id),
      ),
    });
    setMessage({ tone: "success", text: `${milestone?.name ?? "Milestone"} deleted locally.` });
  }

  function renderPlaceholder(view: NavigationItem) {
    const descriptions: Record<NavigationItem, string> = {
      Dashboard:
        "Milestones requiring attention, upcoming milestones, workstream health, open actions, recent decisions, and the executive summary will appear here.",
      Workstreams: "Select Workstreams to manage workstreams, stages, and milestones.",
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

  function renderWorkstreamsWorkspace() {
    if (!projectFile) {
      return null;
    }

    const sortedWorkstreams = projectFile.workstreams.toSorted((first, second) => first.sortOrder - second.sortOrder);

    return (
      <section className="grid gap-6 xl:grid-cols-[20rem_1fr]" id="workstreams">
        <aside className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Workstreams</p>
              <h3 className="mt-2 text-2xl font-bold">Project structure</h3>
            </div>
            <button
              className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
              onClick={createWorkstream}
              type="button"
            >
              Add
            </button>
          </div>

          {sortedWorkstreams.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              No workstreams yet. Create a workstream to start building stages and milestones.
            </div>
          ) : (
            <div className="mt-6 space-y-2">
              {sortedWorkstreams.map((workstream) => (
                <button
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedWorkstreamId === workstream.id
                      ? "border-blue-300 bg-blue-50 text-blue-950"
                      : "border-slate-200 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50"
                  }`}
                  key={workstream.id}
                  onClick={() => {
                    const firstStage = projectFile.stages
                      .filter((stage) => stage.workstreamId === workstream.id)
                      .toSorted((first, second) => first.sortOrder - second.sortOrder)[0];
                    setSelectedWorkstreamId(workstream.id);
                    setSelectedStageId(firstStage?.id ?? null);
                  }}
                  type="button"
                >
                  <span className="block font-semibold">{workstream.name}</span>
                  <span className="mt-1 block text-xs uppercase tracking-[0.18em] text-slate-500">
                    {formatLabel(workstream.status)} · {workstream.owner || "No owner"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="space-y-6">
          {!selectedWorkstream ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
              Select or create a workstream to manage details, stages, and milestones.
            </div>
          ) : (
            <>
              <section className="rounded-3xl border border-slate-200 bg-white p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Selected workstream</p>
                    <h3 className="mt-2 text-2xl font-bold">{selectedWorkstream.name}</h3>
                  </div>
                  <button
                    className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                    onClick={() => deleteWorkstream(selectedWorkstream.id)}
                    type="button"
                  >
                    Delete Workstream
                  </button>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <TextField label="Name" onChange={(value) => updateWorkstream(selectedWorkstream.id, "name", value)} value={selectedWorkstream.name} />
                  <SelectField
                    label="Status"
                    onChange={(value) => updateWorkstream(selectedWorkstream.id, "status", value)}
                    options={workstreamStatuses}
                    value={selectedWorkstream.status}
                  />
                  <TextField label="Owner" onChange={(value) => updateWorkstream(selectedWorkstream.id, "owner", value)} value={selectedWorkstream.owner ?? ""} />
                  <DateField
                    label="Target date"
                    onChange={(value) => updateWorkstream(selectedWorkstream.id, "targetDate", value)}
                    value={selectedWorkstream.targetDate ?? ""}
                  />
                  <TextAreaField
                    label="Description"
                    onChange={(value) => updateWorkstream(selectedWorkstream.id, "description", value)}
                    value={selectedWorkstream.description ?? ""}
                  />
                </div>
              </section>

              <section className="grid gap-6 2xl:grid-cols-[22rem_1fr]">
                <div className="rounded-3xl border border-slate-200 bg-white p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Stages</p>
                      <h4 className="mt-2 text-xl font-bold">Within workstream</h4>
                    </div>
                    <button
                      className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
                      onClick={() => createStage(selectedWorkstream.id)}
                      type="button"
                    >
                      Add Stage
                    </button>
                  </div>

                  {selectedWorkstreamStages.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                      No stages yet. Add a stage to group milestones.
                    </div>
                  ) : (
                    <div className="mt-5 space-y-2">
                      {selectedWorkstreamStages.map((stage) => (
                        <button
                          className={`w-full rounded-2xl border p-4 text-left transition ${
                            selectedStageId === stage.id
                              ? "border-blue-300 bg-blue-50 text-blue-950"
                              : "border-slate-200 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50"
                          }`}
                          key={stage.id}
                          onClick={() => setSelectedStageId(stage.id)}
                          type="button"
                        >
                          <span className="block font-semibold">{stage.name}</span>
                          <span className="mt-1 block text-xs uppercase tracking-[0.18em] text-slate-500">
                            {formatLabel(stage.status ?? "not_started")} · {stage.owner || "No owner"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {!selectedStage ? (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600">
                    Select or create a stage to manage its details and milestones.
                  </div>
                ) : (
                  <div className="space-y-6">
                    <section className="rounded-3xl border border-slate-200 bg-white p-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Selected stage</p>
                          <h4 className="mt-2 text-xl font-bold">{selectedStage.name}</h4>
                        </div>
                        <button
                          className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                          onClick={() => deleteStage(selectedStage.id)}
                          type="button"
                        >
                          Delete Stage
                        </button>
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <TextField label="Name" onChange={(value) => updateStage(selectedStage.id, "name", value)} value={selectedStage.name} />
                        <SelectField
                          label="Status"
                          onChange={(value) => updateStage(selectedStage.id, "status", value)}
                          options={stageStatuses}
                          value={selectedStage.status ?? "not_started"}
                        />
                        <TextField label="Owner" onChange={(value) => updateStage(selectedStage.id, "owner", value)} value={selectedStage.owner ?? ""} />
                        <DateField label="Target date" onChange={(value) => updateStage(selectedStage.id, "targetDate", value)} value={selectedStage.targetDate ?? ""} />
                        <TextAreaField
                          label="Description"
                          onChange={(value) => updateStage(selectedStage.id, "description", value)}
                          value={selectedStage.description ?? ""}
                        />
                      </div>
                    </section>

                    <section className="rounded-3xl border border-slate-200 bg-white p-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Milestones</p>
                          <h4 className="mt-2 text-xl font-bold">Within stage</h4>
                        </div>
                        <button
                          className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
                          onClick={() => createMilestone(selectedStage.id)}
                          type="button"
                        >
                          Add Milestone
                        </button>
                      </div>

                      {selectedStageMilestones.length === 0 ? (
                        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                          No milestones yet. Add a milestone to track governance delivery points.
                        </div>
                      ) : (
                        <div className="mt-5 space-y-4">
                          {selectedStageMilestones.map((milestone) => (
                            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5" key={milestone.id}>
                              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <h5 className="text-lg font-bold">{milestone.name}</h5>
                                  <p className="mt-1 text-sm font-semibold text-amber-700">Variance: {varianceLabel(milestone)}</p>
                                </div>
                                <button
                                  className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                                  onClick={() => deleteMilestone(milestone.id)}
                                  type="button"
                                >
                                  Delete Milestone
                                </button>
                              </div>

                              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                <TextField label="Name" onChange={(value) => updateMilestone(milestone.id, "name", value)} value={milestone.name} />
                                <SelectField
                                  label="Status"
                                  onChange={(value) => updateMilestone(milestone.id, "status", value)}
                                  options={milestoneStatuses}
                                  value={milestone.status}
                                />
                                <TextField label="Owner" onChange={(value) => updateMilestone(milestone.id, "owner", value)} value={milestone.owner ?? ""} />
                                <DateField
                                  label="Target date"
                                  onChange={(value) => updateMilestone(milestone.id, "targetDate", value)}
                                  value={milestone.targetDate ?? ""}
                                />
                                <DateField
                                  label="Planned date"
                                  onChange={(value) => updateMilestone(milestone.id, "plannedDate", value)}
                                  required
                                  value={milestone.plannedDate}
                                />
                                <DateField
                                  label="Forecast date"
                                  onChange={(value) => updateMilestone(milestone.id, "forecastDate", value)}
                                  value={milestone.forecastDate ?? ""}
                                />
                                <DateField
                                  label="Actual date"
                                  onChange={(value) => updateMilestone(milestone.id, "actualDate", value)}
                                  value={milestone.actualDate ?? ""}
                                />
                                <TextAreaField
                                  label="Description"
                                  onChange={(value) => updateMilestone(milestone.id, "description", value)}
                                  value={milestone.description ?? ""}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
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
              Open or create a single local <code className="rounded bg-slate-100 px-1 py-0.5">.pmgov</code> file to
              manage project governance in browser memory.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
                onClick={createNewProject}
                type="button"
              >
                Create New Project
              </button>
              <button
                className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                Open .pmgov File
              </button>
            </div>
            <p className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-900">
              Your project data is stored only in the file you open or save.
            </p>
            <p
              className={`mt-4 rounded-2xl border p-4 text-sm ${
                message.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
              role="status"
            >
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
                  className={`block w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    activeView === item ? "bg-blue-700 text-white" : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                  }`}
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
                  <p className={`mt-1 text-sm font-semibold ${isDirty ? "text-amber-700" : "text-green-700"}`}>
                    {isDirty ? "Unsaved changes" : "Saved"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    Open
                  </button>
                  <button
                    className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => saveProject(false)}
                    type="button"
                  >
                    Save
                  </button>
                  <button
                    className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
                    onClick={() => saveProject(true)}
                    type="button"
                  >
                    Save As
                  </button>
                  <input accept=".pmgov,application/json" className="hidden" onChange={openProject} ref={fileInputRef} type="file" />
                </div>
              </div>
            </header>

            <div className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
              <nav aria-label="Mobile project workspace sections" className="flex gap-2 overflow-x-auto">
                {navigationItems.map((item) => (
                  <button
                    className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${
                      activeView === item ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                    key={item}
                    onClick={() => setActiveView(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </nav>
            </div>

            <div className="flex-1 p-6">
              <p
                className={`mb-6 rounded-2xl border p-4 text-sm ${
                  message.tone === "error"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : message.tone === "success"
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-blue-200 bg-blue-50 text-blue-800"
                }`}
                role="status"
              >
                {message.text}
              </p>

              <div className="mb-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">File</p>
                  <p className="mt-3 text-lg font-bold">{openedFileName ?? "No file saved"}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Validation</p>
                  <p className={`mt-3 text-lg font-bold ${validation?.success ? "text-green-700" : "text-red-700"}`}>
                    {validation?.success ? "Schema valid" : "Schema invalid"}
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Records</p>
                  <p className="mt-3 text-lg font-bold">
                    {countRecords(projectFile).reduce((total, [, count]) => total + count, 0)} governance items
                  </p>
                </div>
              </div>

              {activeView === "Dashboard" ? (
                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <section className="rounded-3xl border border-slate-200 bg-white p-6">
                    <h3 className="text-xl font-bold">Project details</h3>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <TextField label="Project name" onChange={(value) => updateProject("name", value)} value={projectFile.project.name} />
                      <TextField
                        label="Project manager"
                        onChange={(value) => updateProject("projectManager", value)}
                        value={projectFile.project.projectManager}
                      />
                      <TextField label="Sponsor" onChange={(value) => updateProject("sponsor", value)} value={projectFile.project.sponsor ?? ""} />
                      <SelectField
                        label="Status"
                        onChange={(value) => updateProject("status", value as RagStatus)}
                        options={projectStatuses}
                        value={projectFile.project.status}
                      />
                      <TextAreaField
                        label="Executive summary"
                        onChange={(value) => updateProject("executiveSummary", value)}
                        value={projectFile.project.executiveSummary ?? ""}
                      />
                    </div>
                  </section>
                  <section className="rounded-3xl border border-slate-200 bg-white p-6">
                    <h3 className="text-xl font-bold">Governance data model</h3>
                    <dl className="mt-5 grid grid-cols-2 gap-3">
                      {countRecords(projectFile).map(([label, count]) => (
                        <div className="rounded-2xl bg-slate-50 p-4" key={label}>
                          <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</dt>
                          <dd className="mt-2 text-2xl font-bold">{count}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                  {renderPlaceholder("Dashboard")}
                </div>
              ) : activeView === "Workstreams" ? (
                renderWorkstreamsWorkspace()
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

type TextFieldProps = {
  label: string;
  onChange: (value: string) => void;
  value: string;
};

function TextField({ label, onChange, value }: TextFieldProps) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-500"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

type TextAreaFieldProps = TextFieldProps;

function TextAreaField({ label, onChange, value }: TextAreaFieldProps) {
  return (
    <label className="text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-full">
      {label}
      <textarea
        className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-500"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

type SelectFieldProps = {
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
};

function SelectField({ label, onChange, options, value }: SelectFieldProps) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <select
        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-500"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

type DateFieldProps = TextFieldProps & { required?: boolean };

function DateField({ label, onChange, required = false, value }: DateFieldProps) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-500"
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type="date"
        value={value}
      />
    </label>
  );
}
