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

const navigationItems = ["File", "Data model", "Validation"];
const statuses: RagStatus[] = ["not_set", "green", "amber", "red"];

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

export function ProjectFileWorkspace() {
  const [projectFile, setProjectFile] = useState<PmgovFile | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);
  const [openedFileName, setOpenedFileName] = useState<string | null>(null);
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
    setMessage({ tone: "success", text: `${selectedFile.name} opened and validated locally.` });
  }

  function saveAsProject() {
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

    const serialized = serializePmgovFile(validationResult.data);
    const blob = new Blob([serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const filename = buildPmgovFilename(validationResult.data.project.name);

    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

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

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:flex-row lg:gap-8">
        <aside className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:mb-0 lg:w-72">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-700">PGW</p>
            <h1 className="mt-2 text-2xl font-bold">Project Governance Workspace</h1>
          </div>
          <nav aria-label="Task 02 sections" className="space-y-2">
            {navigationItems.map((item) => (
              <a
                className="block rounded-2xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                href={`#${item.toLowerCase().replaceAll(" ", "-")}`}
                key={item}
              >
                {item}
              </a>
            ))}
          </nav>
        </aside>

        <section className="flex-1 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:p-10">
          <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">Task 02 — Data Model and File Lifecycle</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight">
                {projectFile ? projectFile.project.name : "Open or create a local .pmgov file"}
              </h2>
              <p className="mt-3 max-w-2xl text-sm text-slate-600">
                PGW keeps project data in browser memory only. Create, validate, edit, and download a
                user-controlled <code className="rounded bg-slate-100 px-1 py-0.5">.pmgov</code> JSON file.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
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
              <button
                className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={!projectFile}
                onClick={saveAsProject}
                type="button"
              >
                Save As
              </button>
              <input
                accept=".pmgov,application/json"
                className="hidden"
                onChange={openProject}
                ref={fileInputRef}
                type="file"
              />
            </div>
          </header>

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">File</p>
              <p className="mt-3 text-lg font-bold">{openedFileName ?? "No file saved"}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Dirty state</p>
              <p className={`mt-3 text-lg font-bold ${isDirty ? "text-amber-700" : "text-green-700"}`}>
                {projectFile ? (isDirty ? "Unsaved changes" : "Saved") : "No project loaded"}
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Validation</p>
              <p className={`mt-3 text-lg font-bold ${validation?.success ? "text-green-700" : "text-slate-700"}`}>
                {validation ? (validation.success ? "Schema valid" : "Schema invalid") : "Awaiting file"}
              </p>
            </div>
          </div>

          <p
            className={`mb-8 rounded-2xl border p-4 text-sm ${
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

          {projectFile ? (
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <section className="rounded-3xl border border-slate-200 p-6" id="file">
                <h3 className="text-xl font-bold">Project file details</h3>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Project name
                    <input
                      className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-500"
                      onChange={(event) => updateProject("name", event.target.value)}
                      value={projectFile.project.name}
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Project manager
                    <input
                      className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-500"
                      onChange={(event) => updateProject("projectManager", event.target.value)}
                      value={projectFile.project.projectManager}
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Sponsor
                    <input
                      className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-500"
                      onChange={(event) => updateProject("sponsor", event.target.value)}
                      value={projectFile.project.sponsor ?? ""}
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Status
                    <select
                      className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-500"
                      onChange={(event) => updateProject("status", event.target.value as RagStatus)}
                      value={projectFile.project.status}
                    >
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {status.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700 md:col-span-2">
                    Executive summary
                    <textarea
                      className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-950 outline-none focus:border-blue-500"
                      onChange={(event) => updateProject("executiveSummary", event.target.value)}
                      value={projectFile.project.executiveSummary ?? ""}
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 p-6" id="data-model">
                <h3 className="text-xl font-bold">Loaded data model</h3>
                <dl className="mt-5 grid grid-cols-2 gap-3">
                  {countRecords(projectFile).map(([label, count]) => (
                    <div className="rounded-2xl bg-slate-50 p-4" key={label}>
                      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</dt>
                      <dd className="mt-2 text-2xl font-bold">{count}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="rounded-3xl border border-slate-200 p-6 xl:col-span-2" id="validation">
                <h3 className="text-xl font-bold">Validation evidence</h3>
                <pre className="mt-5 overflow-auto rounded-2xl bg-slate-950 p-5 text-sm text-slate-100">
                  {validation?.success
                    ? JSON.stringify(
                        {
                          schemaVersion: projectFile.schemaVersion,
                          fileMetadata: projectFile.fileMetadata,
                          projectId: projectFile.project.id,
                          noServerPersistence: true,
                          dirtyState: isDirty ? "unsaved_changes" : "saved",
                        },
                        null,
                        2,
                      )
                    : validation?.error}
                </pre>
              </section>
            </div>
          ) : (
            <section className="rounded-3xl bg-slate-950 p-8 text-white">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">Local only</p>
              <h3 className="mt-4 text-4xl font-bold leading-tight">Your project data stays in the file you open or save.</h3>
              <p className="mt-5 max-w-2xl text-lg text-slate-200">
                No API route, database, account, or server-side storage is used for project content.
              </p>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
