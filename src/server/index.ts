import express from "express";
import cors from "cors";
import { watch } from "chokidar";
import path from "node:path";
import fs from "node:fs";
import type { Response } from "express";
import {
  listNotes,
  getNote,
  createNote,
  getConnections,
  getMemory,
  getMission,
  setNoteStatus,
  markNoteSeen,
  saveNoteContent,
  getNotesTree,
  moveNoteToFolder,
  ensureNoteFolders,
  migrateFolderIcons,
  patchNoteFrontmatter,
  deleteNote,
} from "./store.js";

const PENDING_DIR = path.resolve(".agent/pending");
const AGENT_JOBS_PATH = path.resolve(".agent/agent-jobs.json");

// OpenClaw integration
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || "http://localhost:18789";
const OPENCLAW_HOOKS_TOKEN = process.env.OPENCLAW_HOOKS_TOKEN || "snippets-hook-secret-2026";

interface AgentConnectivityState {
  lastTriggerAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  lastTriggerOk?: boolean;
}

const agentConnectivity: AgentConnectivityState = {};

function markAgentTrigger(ok: boolean, error?: string) {
  const now = new Date().toISOString();
  agentConnectivity.lastTriggerAt = now;
  agentConnectivity.lastTriggerOk = ok;
  if (ok) {
    agentConnectivity.lastSuccessAt = now;
    agentConnectivity.lastError = undefined;
  } else {
    agentConnectivity.lastError = error || "Unknown trigger error";
  }
}

function getPendingCount(): number {
  try {
    if (!fs.existsSync(PENDING_DIR)) return 0;
    return fs.readdirSync(PENDING_DIR).length;
  } catch {
    return 0;
  }
}

async function triggerAgent(noteId: string): Promise<{ ok: boolean; error?: string }> {
  if (!OPENCLAW_HOOKS_TOKEN) {
    const error = "No hooks token configured";
    console.log(`[openclaw] ${error}`);
    markAgentTrigger(false, error);
    return { ok: false, error };
  }

  try {
    const response = await fetch(`${OPENCLAW_GATEWAY_URL}/hooks/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENCLAW_HOOKS_TOKEN}`,
      },
      body: JSON.stringify({
        name: "Snippets",
        message: `Process Snippets pending queue now. Newly created note id: ${noteId}. Use snippets-ai workflow: read /api/pending, process each note, classify + set folderPath, move with /api/notes/<id>/move, update frontmatter, then DELETE /api/pending/<id>.`,
        model: "openai-codex/gpt-5.3-codex",
        wakeMode: "now",
        deliver: false
      }),
    });

    if (response.ok || response.status === 202) {
      console.log(`[openclaw] Triggered agent for note ${noteId}`);
      markAgentTrigger(true);
      return { ok: true };
    }

    const body = await response.text();
    const error = `Trigger failed: ${response.status} ${body}`;
    console.log(`[openclaw] ${error}`);
    markAgentTrigger(false, error);
    return { ok: false, error };
  } catch (err) {
    const error = `Trigger error: ${String(err)}`;
    console.log(`[openclaw] ${error}`);
    markAgentTrigger(false, error);
    return { ok: false, error };
  }
}

const app = express();
const PORT = 3811;

app.use(cors());
app.use(express.json());

// --- SSE ---

const sseClients = new Set<Response>();

app.get("/api/events", (_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("data: connected\n\n");
  sseClients.add(res);
  _req.on("close", () => sseClients.delete(res));
});

function broadcast(event: string, data?: string) {
  const payload = data
    ? `event: ${event}\ndata: ${data}\n\n`
    : `event: ${event}\ndata: {}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// --- API Routes ---

app.get("/api/notes", (_req, res) => {
  const notes = listNotes();
  res.json(notes.map((n) => ({ ...n.frontmatter, content: undefined })));
});

app.get("/api/notes/:id", (req, res) => {
  const note = getNote(req.params.id);
  if (!note) return res.status(404).json({ error: "Note not found" });
  res.json(note);
});

app.post("/api/notes/:id/seen", (req, res) => {
  const id = req.params.id;
  const note = getNote(id);
  if (!note) return res.status(404).json({ error: "Note not found" });
  markNoteSeen(id);
  res.json({ ok: true });
});

app.delete("/api/notes/:id", (req, res) => {
  const id = req.params.id;
  const note = getNote(id);
  if (!note) return res.status(404).json({ error: "Note not found" });

  const deleted = deleteNote(id);
  if (!deleted) {
    return res.status(500).json({ error: "Failed to delete note" });
  }

  console.log(`[delete] Deleted note ${id}`);
  broadcast("notes-updated");
  res.json({ ok: true });
});

app.patch("/api/notes/:id", async (req, res) => {
  const id = req.params.id;
  const { content } = req.body;
  
  if (!content) return res.status(400).json({ error: "content required" });
  
  const note = getNote(id);
  if (!note) return res.status(404).json({ error: "Note not found" });
  
  const updated = saveNoteContent(id, content);
  if (!updated) return res.status(500).json({ error: "Failed to save note" });
  
  broadcast("notes-updated");
  
  const result = await triggerAgent(id);
  if (!result.ok) {
    console.warn(`[patch] Warning: trigger failed for ${id}: ${result.error}`);
  }
  
  res.json(updated);
});

app.get("/api/tree", (_req, res) => {
  res.json(getNotesTree());
});

app.post("/api/notes", async (req, res) => {
  const { content } = req.body;
  if (!content || typeof content !== "string") {
    return res.status(400).json({ error: "content is required" });
  }
  const note = createNote(content);
  
  // Queue for AI processing
  fs.mkdirSync(PENDING_DIR, { recursive: true });
  fs.writeFileSync(path.join(PENDING_DIR, note.frontmatter.id), "");
  setNoteStatus(note.frontmatter.id, "queued");
  console.log(`[queue] Note ${note.frontmatter.id} queued for processing`);

  // Trigger OpenClaw agent immediately
  const result = await triggerAgent(note.frontmatter.id);
  if (!result.ok) {
    setNoteStatus(note.frontmatter.id, "failed", result.error || "trigger failed");
  }

  res.status(201).json(note);
});

// --- Processing Queue ---

app.get("/api/pending", (_req, res) => {
  // List notes pending AI processing
  if (!fs.existsSync(PENDING_DIR)) {
    return res.json([]);
  }
  const pending = fs.readdirSync(PENDING_DIR);
  res.json(pending);
});

app.post("/api/notes/:id/retry", async (req, res) => {
  const id = req.params.id;
  const note = getNote(id);
  if (!note) return res.status(404).json({ error: "Note not found" });

  fs.mkdirSync(PENDING_DIR, { recursive: true });
  fs.writeFileSync(path.join(PENDING_DIR, id), "");
  setNoteStatus(id, "queued");
  console.log(`[queue] Note ${id} queued for retry`);

  const result = await triggerAgent(id);
  if (!result.ok) {
    setNoteStatus(id, "failed", result.error || "retry trigger failed");
    return res.status(502).json({ ok: false, error: result.error || "retry trigger failed" });
  }

  res.json({ ok: true });
});

app.post("/api/notes/:id/move", (req, res) => {
  const id = req.params.id;
  const folderPath = typeof req.body?.folderPath === "string" ? req.body.folderPath : "";

  const moved = moveNoteToFolder(id, folderPath);
  if (!moved) {
    return res.status(400).json({ error: "Invalid folderPath or note not found" });
  }

  res.json({ ok: true, note: moved });
});

app.post("/api/pending/:id/start", (req, res) => {
  const id = req.params.id;
  setNoteStatus(id, "processing");
  console.log(`[queue] Note ${id} marked as processing`);
  res.status(204).send();
});

app.get("/api/user-actions", (_req, res) => {
  const notes = listNotes();
  const userActions: {
    noteId: string;
    noteTitle?: string;
    actionIndex: number;
    label: string;
    priority?: string;
    status: string;
  }[] = [];

  for (const note of notes) {
    const actions = note.frontmatter.suggestedActions || [];
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (action.assignee === "user") {
        userActions.push({
          noteId: note.frontmatter.id,
          noteTitle: note.frontmatter.title,
          actionIndex: i,
          label: action.label,
          priority: action.priority,
          status: action.status || "pending",
        });
      }
    }
  }

  res.json(userActions);
});

app.post("/api/user-actions/:noteId/:actionIndex/complete", (req, res) => {
  const { noteId, actionIndex } = req.params;
  const { result } = req.body;

  const note = getNote(noteId);
  if (!note) return res.status(404).json({ error: "Note not found" });

  const actions = note.frontmatter.suggestedActions || [];
  const idx = parseInt(actionIndex, 10);
  if (idx < 0 || idx >= actions.length) {
    return res.status(400).json({ error: "Action index out of range" });
  }

  actions[idx].status = "completed";
  if (result) actions[idx].result = result;

  const updated = patchNoteFrontmatter(noteId, { suggestedActions: actions });
  if (!updated) return res.status(500).json({ error: "Failed to update action" });

  broadcast("notes-updated");
  res.json({ ok: true, action: actions[idx] });
});

app.post("/api/user-actions/:noteId/:actionIndex/decline", (req, res) => {
  const { noteId, actionIndex } = req.params;

  const note = getNote(noteId);
  if (!note) return res.status(404).json({ error: "Note not found" });

  const actions = note.frontmatter.suggestedActions || [];
  const idx = parseInt(actionIndex, 10);
  if (idx < 0 || idx >= actions.length) {
    return res.status(400).json({ error: "Action index out of range" });
  }

  actions[idx].status = "declined";

  const updated = patchNoteFrontmatter(noteId, { suggestedActions: actions });
  if (!updated) return res.status(500).json({ error: "Failed to update action" });

  broadcast("notes-updated");
  res.json({ ok: true, action: actions[idx] });
});

// In-memory job tracking
interface AgentJob {
  id: string;
  status: "running" | "completed" | "failed";
  result?: string;
  startedAt: string;
  completedAt?: string;
  sessionKey?: string;
  noteId: string;
  actionIndex: number;
}
const agentJobs = new Map<string, AgentJob>();

function loadAgentJobs(): void {
  try {
    const raw = fs.readFileSync(AGENT_JOBS_PATH, "utf-8");
    const jobs = JSON.parse(raw) as AgentJob[];
    for (const job of jobs) {
      if (!job?.id) continue;
      agentJobs.set(job.id, job);
    }
  } catch {
    // no-op: missing file is expected on first run
  }
}

function saveAgentJobs(): void {
  fs.mkdirSync(path.dirname(AGENT_JOBS_PATH), { recursive: true });
  const jobs = [...agentJobs.values()];
  fs.writeFileSync(AGENT_JOBS_PATH, JSON.stringify(jobs, null, 2));
}

app.post("/api/agent-actions/:noteId/:actionIndex/run", async (req, res) => {
  const { noteId, actionIndex } = req.params;
  const note = getNote(noteId);
  if (!note) return res.status(404).json({ error: "Note not found" });

  const actions = note.frontmatter.suggestedActions || [];
  const idx = parseInt(actionIndex, 10);
  if (idx < 0 || idx >= actions.length) {
    return res.status(400).json({ error: "Action index out of range" });
  }

  const action = actions[idx];
  if (action.assignee !== "agent") {
    return res.status(400).json({ error: "Only agent actions can be run" });
  }

  const jobId = `job-${noteId}-${idx}-${Date.now()}`;
  const job: AgentJob = {
    id: jobId,
    status: "running",
    startedAt: new Date().toISOString(),
    noteId,
    actionIndex: idx,
  };

  agentJobs.set(jobId, job);
  saveAgentJobs();

  // Update action with job tracking
  actions[idx].jobId = jobId;
  actions[idx].jobStatus = "running";
  actions[idx].jobStartedAt = job.startedAt;
  patchNoteFrontmatter(noteId, { suggestedActions: actions });
  broadcast("notes-updated");

  // Queue action for processing via OpenClaw webhook
  const taskLabel = action.label || action.type;
  const callbackUrl = `http://localhost:${PORT}/api/agent-actions/${encodeURIComponent(noteId)}/${idx}/complete`;
  const completeCmd = `curl -sS -X POST '${callbackUrl}' -H 'Content-Type: application/json' -d '{"jobId":"${jobId}","status":"completed"}'`;
  const failCmd = `curl -sS -X POST '${callbackUrl}' -H 'Content-Type: application/json' -d '{"jobId":"${jobId}","status":"failed"}'`;

  const taskPrompt = `Execute this Snippets agent action:\n\n**${taskLabel}**\n\nIMPORTANT: when done, report status back to Snippets backend:\n- On success run exactly:\n${completeCmd}\n- On failure run exactly:\n${failCmd}\n\nAfter running the callback command, provide the user-facing result concisely (max 200 words). If successful, start with ✓. If it fails, explain why.`;

  // Trigger task asynchronously in background
  setTimeout(async () => {
    try {
      const triggerRes = await fetch(`${OPENCLAW_GATEWAY_URL}/hooks/agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENCLAW_HOOKS_TOKEN}`,
        },
        body: JSON.stringify({
          name: `Snippets Action: ${taskLabel}`,
          message: `Action ID: ${jobId}\n\n${taskPrompt}`,
          wakeMode: "now",
          deliver: false,
        }),
      });

      if (triggerRes.ok || triggerRes.status === 202) {
        console.log(`[agent] Queued action execution for job ${jobId}: ${taskLabel}`);
        markAgentTrigger(true);
      } else {
        const errText = await triggerRes.text().catch(() => "Unknown error");
        const triggerError = `Failed to queue action: ${triggerRes.status} ${errText}`;
        console.error(`[agent] ${triggerError}`);
        markAgentTrigger(false, triggerError);
        job.status = "failed";
        job.result = `Failed to queue: ${triggerRes.status}`;
        job.completedAt = new Date().toISOString();
        updateActionJobStatus(noteId, idx, job);
      }
    } catch (err) {
      const triggerError = `Error queuing action: ${String(err)}`;
      console.error(`[agent] ${triggerError}`);
      markAgentTrigger(false, triggerError);
      job.status = "failed";
      job.result = `Error: ${String(err)}`;
      job.completedAt = new Date().toISOString();
      updateActionJobStatus(noteId, idx, job);
    }
  }, 100);

  // Guard against forever-running UI if callback never comes back.
  setTimeout(() => {
    const current = agentJobs.get(jobId);
    if (!current || current.status !== "running") return;

    current.status = "failed";
    current.completedAt = new Date().toISOString();
    if (!current.result) {
      current.result = "Timed out waiting for action completion callback. Please rerun.";
    }
    updateActionJobStatus(noteId, idx, current);
  }, 15 * 60 * 1000);

  res.json({ ok: true, jobId, status: "running" });
});

app.post("/api/agent-actions/:noteId/:actionIndex/complete", (req, res) => {
  const { noteId, actionIndex } = req.params;
  const idx = parseInt(actionIndex, 10);
  const note = getNote(noteId);
  if (!note) return res.status(404).json({ error: "Note not found" });

  const actions = note.frontmatter.suggestedActions || [];
  if (idx < 0 || idx >= actions.length) {
    return res.status(400).json({ error: "Action index out of range" });
  }

  const action = actions[idx];
  const status = req.body?.status === "failed" ? "failed" : "completed";
  const incomingJobId = typeof req.body?.jobId === "string" ? req.body.jobId : undefined;
  const jobId = action.jobId;

  if (!jobId) {
    return res.status(400).json({ error: "No job is associated with this action" });
  }

  if (incomingJobId && incomingJobId !== jobId) {
    return res.status(409).json({ error: "Job ID mismatch" });
  }

  const job: AgentJob =
    agentJobs.get(jobId) || {
      id: jobId,
      status,
      startedAt: action.jobStartedAt || new Date().toISOString(),
      noteId,
      actionIndex: idx,
    };

  job.status = status;
  job.completedAt = new Date().toISOString();

  const resultText = typeof req.body?.result === "string" ? req.body.result.trim() : "";
  if (resultText) {
    job.result = resultText;
  } else if (status === "failed" && !job.result) {
    job.result = "Action failed in hook execution.";
  } else if (status === "completed" && !job.result) {
    job.result = "Completed. Result was delivered via hook output.";
  }

  updateActionJobStatus(noteId, idx, job);
  res.json({ ok: true, jobId: job.id, status: job.status });
});

app.get("/api/agent-actions/:noteId/:actionIndex/status", (_req, res) => {
  const { noteId, actionIndex } = _req.params;
  const note = getNote(noteId);
  if (!note) return res.status(404).json({ error: "Note not found" });

  const actions = note.frontmatter.suggestedActions || [];
  const idx = parseInt(actionIndex, 10);
  if (idx < 0 || idx >= actions.length) {
    return res.status(400).json({ error: "Action index out of range" });
  }

  const action = actions[idx];
  const jobId = action.jobId;
  if (!jobId) return res.json({ status: "not-started" });

  const job = agentJobs.get(jobId);
  if (!job) {
    // Fallback to persisted frontmatter status when in-memory cache is missing.
    // If it's still marked running long after start, mark it failed so UI doesn't spin forever.
    if (action.jobStatus === "running") {
      const startedMs = action.jobStartedAt ? new Date(action.jobStartedAt).getTime() : NaN;
      const isStale = Number.isFinite(startedMs) && Date.now() - startedMs > 10 * 60 * 1000;
      if (isStale) {
        actions[idx].jobStatus = "failed";
        if (!actions[idx].result) {
          actions[idx].result = "Lost job tracking after restart. Please rerun this action.";
        }
        patchNoteFrontmatter(noteId, { suggestedActions: actions });
        broadcast("notes-updated");
        return res.json({
          jobId,
          status: "failed",
          result: actions[idx].result,
          recovered: true,
        });
      }
    }

    if (action.jobStatus) {
      return res.json({
        jobId,
        status: action.jobStatus,
        result: action.result,
      });
    }

    return res.json({ status: "unknown", jobId });
  }

  res.json({
    jobId,
    status: job.status,
    result: job.result,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  });
});

function updateActionJobStatus(noteId: string, actionIdx: number, job: AgentJob) {
  const note = getNote(noteId);
  if (!note) return;

  const actions = note.frontmatter.suggestedActions || [];
  if (actionIdx < 0 || actionIdx >= actions.length) return;

  actions[actionIdx].jobStatus = job.status as any;
  if (job.status === "completed") {
    actions[actionIdx].status = "completed";
  }
  if (job.result) actions[actionIdx].result = job.result;
  patchNoteFrontmatter(noteId, { suggestedActions: actions });
  agentJobs.set(job.id, job);
  saveAgentJobs();
  broadcast("notes-updated");
}

app.delete("/api/pending/:id", (req, res) => {
  // Mark note as processed (remove from queue)
  const id = req.params.id;
  const filePath = path.join(PENDING_DIR, id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  setNoteStatus(id, "processed");
  console.log(`[queue] Note ${id} marked as processed`);
  res.status(204).send();
});

app.get("/api/connections", (_req, res) => {
  res.json(getConnections());
});

app.get("/api/memory", (_req, res) => {
  res.json({ content: getMemory() });
});

app.get("/api/mission", (_req, res) => {
  res.json({ content: getMission() });
});

app.get("/api/agent/status", (_req, res) => {
  const hasHooksToken = Boolean(OPENCLAW_HOOKS_TOKEN);
  const runningJobs = [...agentJobs.values()].filter((job) => job.status === "running").length;
  const pendingQueue = getPendingCount();

  const state: "online" | "degraded" | "offline" = !hasHooksToken
    ? "offline"
    : agentConnectivity.lastTriggerOk === false
      ? "degraded"
      : "online";

  res.json({
    state,
    available: hasHooksToken,
    listening: true,
    pendingQueue,
    runningJobs,
    lastTriggerAt: agentConnectivity.lastTriggerAt,
    lastSuccessAt: agentConnectivity.lastSuccessAt,
    lastError: agentConnectivity.lastError,
  });
});

// --- Chokidar Watcher ---

// Ensure directories exist
ensureNoteFolders();
migrateFolderIcons();
fs.mkdirSync(PENDING_DIR, { recursive: true });
loadAgentJobs();

const watcher = watch(
  [
    path.resolve("notes"),
    path.resolve(".agent"),
    path.resolve("MEMORY.md"),
    path.resolve("MISSION.md"),
  ],
  { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 300 } }
);

watcher.on("all", (event, filePath) => {
  const rel = path.relative(process.cwd(), filePath);
  console.log(`[watch] ${event}: ${rel}`);

  if (rel.startsWith("notes/")) {
    broadcast("notes-updated", JSON.stringify({ file: rel, event }));
  } else if (rel.startsWith(".agent/")) {
    broadcast("connections-updated");
  } else if (rel === "MEMORY.md") {
    broadcast("memory-updated");
  } else if (rel === "MISSION.md") {
    broadcast("mission-updated");
  }
});

// --- Start ---

app.listen(PORT, () => {
  console.log(`notes-ai server listening on http://localhost:${PORT}`);
});
