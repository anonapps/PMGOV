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

const pages = ["Dashboard", "Workstreams", "Timeline", "Notebook", "Governance", "Reports", "Settings"] as const;
const statuses: RagStatus[] = ["not_set", "green", "amber", "red"];

type Page = (typeof pages)[number];
type Message = { tone: "success" | "error" | "info"; text: string };

type Placeholder = {
  title: string;
  description: string;
  bullets: string[];
};

const pagePlaceholders: Record<Page, Placeholder> = {
  Dashboard: {
    title: "Dashboard",
    description: "Governance overview placeholder. Detailed dashboard cards arrive in Task 07.",
    bullets: ["Milestones requiring attention", "Upcoming milestones", "Workstream health", "Open actions", "Recent decisions"],
  },
  Workstreams: {
    title: "Workstreams",
    description: "Workstream, stage, and milestone management placeholder. Editing arrives in Task 04.",
    bullets: ["Workstream list", "Selected workstream details", "Stages", "Milestones grouped by stage"],
  },
  Timeline: {
    title: "Timeline",
    description: "Roadmap placeholder for future milestone timeline views.",
    bullets: ["Workstream", "Stage", "Milestone", "Planned", "Forecast", "Actual", "Status"],
  },
  Notebook: {
    title: "Notebook",
    description: "Meeting notes and governance capture placeholder. Notebook editing arrives in Task 05.",
    bullets: ["Notes list", "Search and filters", "Note editor", "Manual action and decision extraction"],
  },
  Governance: {
    title: "Governance",
    description: "Actions and decisions register placeholder. Register workflows arrive in Task 06.",
    bullets: ["Actions register", "Decisions register", "Linked notes", "Status and impact fields"],
  },
  Reports: {
    title: "Reports",
    description: "Executive reporting placeholder. Report generation arrives in Task 08.",
    bullets: ["Project health", "Executive summary", "Milestones requiring attention", "Open actions", "Key decisions"],
  },
  Settings: {
    title: "Settings",
    description: "Local workspace settings placeholder. Project data remains in the .pmgov file only.",
    bullets: ["File metadata", "Schema version", "Local-only privacy reminder", "No backend persistence"],
  },
};

function countRecords(file: PmgovFile) {
  return [
    ["Workstreams", file.workstreams.length],
    ["Stages", file.stages.length],
    ["Milestones", file.milestones.length],
    ["Notes", file.notes.length],
    ["Decisions", file.decisions.length],
    ["Actions", file.actions.length],
    ["Reports", file.reports.length],
  ] as const;
}

function messageClasses(tone: Message["tone"]) {
  if (tone === "error") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (tone === "success") {
    return "border-green-200 bg-green-50 text-green-800";
  }

  return "border-blue-200 bg-blue-50 text-blue-800";
}

export function ProjectFileWorkspace() {
  const [projectFile, setProjectFile] = useState<PmgovFile | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);
  const [openedFileName, setOpenedFileName] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<Page>("Dashboard");
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
    setActivePage("Dashboard");
    setMessage({ tone: "success", text: "New in-memory project created. Use Save or Save As to download a .pmgov file." });
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
    setActivePage("Dashboard");
    setMessage({ tone: "success", text: `${selectedFile.name} opened and validated locally.` });
  }

  function downloadProjectFile(preferredName?: string) {
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
    const filename = preferredName?.endsWith(".pmgov") ? preferredName : buildPmgovFilename(validationResult.data.project.name);

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
      <input accept=".pmgov,application/json" className="hidden" onChange={openProject} ref={fileInputRef} type="file" />

      {projectFile ? (
        <div className="flex min-h-screen">
          <aside className="hidden w-72 border-r border-slate-200 bg-white p-5 shadow-sm lg:block">
            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-700">PGW</p>
              <h1 className="mt-2 text-2xl font-bold">Project Governance Workspace</h1>
            </div>
            <nav aria-label="Primary navigation" className="space-y-2">
              {pages.map((page) => (
                <button
                  className={`block w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                    activePage === page ? "bg-blue-700 text-white shadow-sm" : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                  key={page}
                  onClick={() => setActivePage(page)}
                  type="button"
                >
                  {page}
                </button>
              ))}
            </nav>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur lg:px-8">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Current project</p>
                  <h2 className="mt-1 truncate text-2xl font-bold tracking-tight">{projectFile.project.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{openedFileName ?? "Unsaved local project"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                      isDirty ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                    }`}
                  >
                    {isDirty ? "Unsaved changes" : "Saved"}
                  </span>
                  <button
                    className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    Open
                  </button>
                  <button
                    className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
                    onClick={() => downloadProjectFile(openedFileName ?? undefined)}
                    type="button"
                  >
                    Save
                  </button>
                  <button
                    className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => downloadProjectFile()}
                    type="button"
                  >
                    Save As
                  </button>
                </div>
              </div>
              <nav aria-label="Mobile navigation" className="mt-4 flex gap-2 overflow-x-auto lg:hidden">
                {pages.map((page) => (
                  <button
                    className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${
                      activePage === page ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                    key={page}
                    onClick={() => setActivePage(page)}
                    type="button"
                  >
                    {page}
                  </button>
                ))}
              </nav>
            </header>

            <div className="flex-1 p-5 lg:p-8">
              <p className={`mb-6 rounded-2xl border p-4 text-sm ${messageClasses(message.tone)}`} role="status">
                {message.text}
              </p>
              <ProjectPage
                activePage={activePage}
                isDirty={isDirty}
                projectFile={projectFile}
                updateProject={updateProject}
                validationMessage={validation?.success ? "Schema valid" : validation?.error ?? "Awaiting file"}
              />
            </div>
          </section>
        </div>
      ) : (
        <StartScreen createNewProject={createNewProject} openFile={() => fileInputRef.current?.click()} message={message} />
      )}
    </main>
  );
}

function StartScreen({ createNewProject, openFile, message }: { createNewProject: () => void; openFile: () => void; message: Message }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10">
      <section className="grid w-full gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div className="rounded-[2rem] bg-slate-950 p-8 text-white shadow-xl lg:p-12">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-200">Project Governance Workspace</p>
          <h1 className="mt-6 text-5xl font-bold leading-tight">Governance work, stored only in your local project file.</h1>
          <p className="mt-6 text-lg text-slate-200">
            Your project data is stored only in the file you open or save. PGW does not use backend persistence,
            databases, authentication, accounts, or cloud project storage.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
              onClick={createNewProject}
              type="button"
            >
              Create New Project
            </button>
            <button
              className="rounded-2xl border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              onClick={openFile}
              type="button"
            >
              Open .pmgov File
            </button>
          </div>
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold">Start local-first</h2>
          <p className="mt-3 text-slate-600">
            Create a clean `.pmgov` file or open an existing one such as `examples/sample-project.pmgov`.
          </p>
          <p className={`mt-6 rounded-2xl border p-4 text-sm ${messageClasses(message.tone)}`} role="status">
            {message.text}
          </p>
        </div>
      </section>
    </div>
  );
}

function ProjectPage({
  activePage,
  isDirty,
  projectFile,
  updateProject,
  validationMessage,
}: {
  activePage: Page;
  isDirty: boolean;
  projectFile: PmgovFile;
  updateProject: <K extends keyof Project>(key: K, value: Project[K]) => void;
  validationMessage: string;
}) {
  const placeholder = pagePlaceholders[activePage];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-blue-700">{activePage}</p>
        <h3 className="mt-2 text-3xl font-bold tracking-tight">{placeholder.title}</h3>
        <p className="mt-3 max-w-3xl text-slate-600">{placeholder.description}</p>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {placeholder.bullets.map((bullet) => (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm font-medium text-slate-700" key={bullet}>
              {bullet}
            </div>
          ))}
        </div>
      </section>

      {activePage === "Settings" ? (
        <SettingsPanel isDirty={isDirty} projectFile={projectFile} validationMessage={validationMessage} />
      ) : (
        <DashboardLikePanel isDirty={isDirty} projectFile={projectFile} updateProject={updateProject} validationMessage={validationMessage} />
      )}
    </div>
  );
}

function DashboardLikePanel({
  isDirty,
  projectFile,
  updateProject,
  validationMessage,
}: {
  isDirty: boolean;
  projectFile: PmgovFile;
  updateProject: <K extends keyof Project>(key: K, value: Project[K]) => void;
  validationMessage: string;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-bold">Project summary</h3>
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

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-bold">File lifecycle</h3>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          {countRecords(projectFile).map(([label, count]) => (
            <div className="rounded-2xl bg-slate-50 p-4" key={label}>
              <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</dt>
              <dd className="mt-2 text-2xl font-bold">{count}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 rounded-2xl bg-slate-950 p-5 text-sm text-slate-100">
          <p>Validation: {validationMessage}</p>
          <p className="mt-2">Dirty state: {isDirty ? "unsaved_changes" : "saved"}</p>
          <p className="mt-2">Persistence: browser memory and explicit file download only</p>
        </div>
      </section>
    </div>
  );
}

function SettingsPanel({ isDirty, projectFile, validationMessage }: { isDirty: boolean; projectFile: PmgovFile; validationMessage: string }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-bold">Local file settings</h3>
      <dl className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Schema version</dt>
          <dd className="mt-2 font-bold">{projectFile.schemaVersion}</dd>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Validation</dt>
          <dd className="mt-2 font-bold">{validationMessage}</dd>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Created</dt>
          <dd className="mt-2 font-bold">{projectFile.fileMetadata.createdAt}</dd>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Unsaved changes</dt>
          <dd className="mt-2 font-bold">{isDirty ? "Yes" : "No"}</dd>
        </div>
      </dl>
    </section>
  );
}
