"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import type { PmgovFile, Project, RagStatus } from "@/types/pmgov";
import {
  buildPmgovFilename,
  createEmptyProjectFile,
  parsePmgovJson,
  preparePmgovForSave,
  serializePmgovFile,
  validatePmgovFile,
} from "@/lib/pmgov";

const navigationItems = ["Dashboard", "Workstreams", "Timeline", "Notebook", "Governance", "Reports", "Settings"] as const;
const statuses: RagStatus[] = ["not_set", "green", "amber", "red"];

type NavigationItem = (typeof navigationItems)[number];
type Message = { tone: "success" | "error" | "info"; text: string };

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
    setProjectFile((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        project: {
          ...current.project,
          [key]: value,
        },
      };
    });
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
                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <section className="rounded-3xl border border-slate-200 bg-white p-6">
                    <h3 className="text-xl font-bold">Project details</h3>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <label className="text-sm font-medium text-slate-700">Project name<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-500" onChange={(event) => updateProject("name", event.target.value)} value={projectFile.project.name} /></label>
                      <label className="text-sm font-medium text-slate-700">Project manager<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-500" onChange={(event) => updateProject("projectManager", event.target.value)} value={projectFile.project.projectManager} /></label>
                      <label className="text-sm font-medium text-slate-700">Sponsor<input className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-500" onChange={(event) => updateProject("sponsor", event.target.value)} value={projectFile.project.sponsor ?? ""} /></label>
                      <label className="text-sm font-medium text-slate-700">Status<select className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-500" onChange={(event) => updateProject("status", event.target.value as RagStatus)} value={projectFile.project.status}>{statuses.map((status) => (<option key={status} value={status}>{status.replace("_", " ")}</option>))}</select></label>
                      <label className="text-sm font-medium text-slate-700 md:col-span-2">Executive summary<textarea className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-500" onChange={(event) => updateProject("executiveSummary", event.target.value)} value={projectFile.project.executiveSummary ?? ""} /></label>
                    </div>
                  </section>
                  <section className="rounded-3xl border border-slate-200 bg-white p-6">
                    <h3 className="text-xl font-bold">Governance data model</h3>
                    <dl className="mt-5 grid grid-cols-2 gap-3">{countRecords(projectFile).map(([label, count]) => (<div className="rounded-2xl bg-slate-50 p-4" key={label}><dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</dt><dd className="mt-2 text-2xl font-bold">{count}</dd></div>))}</dl>
                  </section>
                  {renderPlaceholder("Dashboard")}
                </div>
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
