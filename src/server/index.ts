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
  addConnectionEdge,
  getMemory,
  getMission,
  setNoteStatus,
  markNoteSeen,
  saveNoteContent,
  getNotesTree,
  moveNoteToFolder,
  removeFolder,
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
    "X-Accel-Buffering": "no",
  });
  res.write("data: connected\n\n");
  sseClients.add(res);

  // Cleanup on close
  _req.on("close", () => {
    sseClients.delete(res);
  });

  // Cleanup on error
  res.on("error", () => {
    sseClients.delete(res);
  });

  // Send heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    if (!res.headersSent || res.closed) {
      clearInterval(heartbeat);
      sseClients.delete(res);
      return;
    }
    res.write(":heartbeat\n\n");
  }, 30 * 1000);
});

function broadcast(event: string, data?: string) {
  const payload = data
    ? `event: ${event}\ndata: ${data}\n\n`
    : `event: ${event}\ndata: {}\n\n`;

  const deadClients = [];
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      deadClients.push(client);
    }
  }

  // Clean up any dead clients
  for (const client of deadClients) {
    sseClients.delete(client);
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
  
  if (!content || typeof content !== "string") {
    return res.status(400).json({ error: "content required and must be string" });
  }

  const trimmed = content.trim();
  if (trimmed.length < 1) {
    return res.status(400).json({ error: "content cannot be empty" });
  }

  if (trimmed.length > 100000) {
    return res.status(413).json({ error: "content too large (max 100KB)" });
  }
  
  const note = getNote(id);
  if (!note) return res.status(404).json({ error: "Note not found" });
  
  let updated;
  try {
    updated = saveNoteContent(id, trimmed);
  } catch (err) {
    console.error(`[patch] Failed to save note ${id}: ${String(err)}`);
    return res.status(500).json({ error: "Failed to save note" });
  }

  if (!updated) return res.status(500).json({ error: "Failed to save note" });
  
  broadcast("notes-updated");
  
  const result = await triggerAgent(id);
  if (!result.ok) {
    console.warn(`[patch] Warning: trigger failed for ${id}: ${result.error}`);
  }
  
  res.json(updated);
});

app.patch("/api/notes/:id/meta", (req, res) => {
  const id = req.params.id;
  const note = getNote(id);
  if (!note) return res.status(404).json({ error: "Note not found" });

  const patch: { title?: string } = {};
  if ("title" in req.body) {
    if (req.body.title !== undefined && typeof req.body.title !== "string") {
      return res.status(400).json({ error: "title must be string" });
    }
    const trimmedTitle = typeof req.body.title === "string" ? req.body.title.trim() : "";
    if (trimmedTitle.length > 180) {
      return res.status(413).json({ error: "title too long (max 180 chars)" });
    }
    patch.title = trimmedTitle || undefined;
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "No metadata fields provided" });
  }

  const updated = patchNoteFrontmatter(id, patch);
  if (!updated) return res.status(500).json({ error: "Failed to update note metadata" });

  broadcast("notes-updated");
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

  const trimmed = content.trim();
  if (trimmed.length < 3) {
    return res.status(400).json({ error: "content too short (minimum 3 characters)" });
  }

  if (trimmed.length > 100000) {
    return res.status(413).json({ error: "content too large (max 100KB)" });
  }

  let note;
  try {
    note = createNote(trimmed);
  } catch (err) {
    const errMsg = `Failed to create note: ${String(err)}`;
    console.error(`[notes] ${errMsg}`);
    return res.status(500).json({ error: errMsg });
  }
  
  // Queue for AI processing
  try {
    fs.mkdirSync(PENDING_DIR, { recursive: true });
    fs.writeFileSync(path.join(PENDING_DIR, note.frontmatter.id), "");
    setNoteStatus(note.frontmatter.id, "queued");
    console.log(`[queue] Note ${note.frontmatter.id} queued for processing`);

    // Trigger OpenClaw agent immediately
    const result = await triggerAgent(note.frontmatter.id);
    if (!result.ok) {
      setNoteStatus(note.frontmatter.id, "failed", result.error || "trigger failed");
      console.warn(`[notes] Agent trigger failed for ${note.frontmatter.id}: ${result.error}`);
    }
  } catch (err) {
    console.warn(`[notes] Queueing or trigger error for ${note.frontmatter.id}: ${String(err)}`);
    // Still return the created note; async processing can be retried
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

app.post("/api/folders/remove", (req, res) => {
  const folderPath = typeof req.body?.folderPath === "string" ? req.body.folderPath : "";
  const result = removeFolder(folderPath);
  if (!result.ok) {
    return res.status(400).json(result);
  }
  console.log(`[folders] Removed ${folderPath}; moved ${result.movedNotes} note(s) to inbox`);
  broadcast("notes-updated");
  res.json(result);
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
  linkedNoteId?: string;
  linkedNoteTitle?: string;
}

// Track recent action executions to prevent spam/duplicates
interface ActionExecution {
  noteId: string;
  actionIndex: number;
  timestamp: number;
}
const recentActions = new Map<string, ActionExecution>();
const ACTION_COOLDOWN_MS = 60 * 1000; // 60 second cooldown per action

function getActionKey(noteId: string, actionIdx: number): string {
  return `${noteId}#${actionIdx}`;
}

function checkActionCooldown(noteId: string, actionIdx: number): { allowed: boolean; reason?: string } {
  const key = getActionKey(noteId, actionIdx);
  const recent = recentActions.get(key);
  const now = Date.now();

  if (recent && now - recent.timestamp < ACTION_COOLDOWN_MS) {
    const remaining = Math.ceil((ACTION_COOLDOWN_MS - (now - recent.timestamp)) / 1000);
    return { allowed: false, reason: `Action already ran recently. Wait ${remaining}s before retrying.` };
  }

  return { allowed: true };
}

function recordActionExecution(noteId: string, actionIdx: number): void {
  const key = getActionKey(noteId, actionIdx);
  recentActions.set(key, { noteId, actionIndex: actionIdx, timestamp: Date.now() });

  // Cleanup old entries periodically
  if (recentActions.size > 200) {
    const now = Date.now();
    for (const [k, v] of recentActions.entries()) {
      if (now - v.timestamp > 5 * 60 * 1000) {
        recentActions.delete(k);
      }
    }
  }
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

function cleanupStalledJobs(): void {
  const now = Date.now();
  const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
  let cleaned = 0;

  for (const [jobId, job] of agentJobs.entries()) {
    if (job.status !== "running") continue;

    const startedMs = job.startedAt ? new Date(job.startedAt).getTime() : NaN;
    if (!Number.isFinite(startedMs)) continue;

    const ageMs = now - startedMs;
    if (ageMs > STALE_THRESHOLD_MS) {
      job.status = "failed";
      job.completedAt = new Date().toISOString();
      if (!job.result) {
        job.result = `Job timeout: no completion callback after ${Math.round(ageMs / 60000)} minutes. Server may have been restarted.`;
      }
      updateActionJobStatus(job.noteId, job.actionIndex, job);
      cleaned++;
      console.warn(`[cleanup] Marked stalled job ${jobId} as failed after ${Math.round(ageMs / 60000)}m`);
    }
  }

  if (cleaned > 0) {
    saveAgentJobs();
  }
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

  // Check cooldown to prevent duplicate/spam triggers
  const cooldown = checkActionCooldown(noteId, idx);
  if (!cooldown.allowed) {
    return res.status(429).json({ error: cooldown.reason || "Action is on cooldown" });
  }

  const action = actions[idx];
  if (action.assignee !== "agent") {
    return res.status(400).json({ error: "Only agent actions can be run" });
  }

  recordActionExecution(noteId, idx);

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
  // Use externally accessible host for callback (prefer Host header, fallback to tailnet)
  const callbackHost = req.get("Host") || "100.79.67.17:3811";
  const callbackUrl = `http://${callbackHost}/api/agent-actions/${encodeURIComponent(noteId)}/${idx}/complete`;

  const createNoteUrl = `http://localhost:${PORT}/api/notes`;
  const taskPrompt = `Execute this Snippets agent action:\n\n**${taskLabel}**\n\nIMPORTANT: when done, report status back to Snippets backend by calling the callback URL with JSON.\n\nIf your action creates a new note, you MUST create it via the API so Snippets assigns a proper ID:\n\ncurl -sS -X POST '${createNoteUrl}' -H 'Content-Type: application/json' -d '{"content":"<FULL_MARKDOWN_CONTENT>"}'\n\nThe response JSON has shape { "frontmatter": { "id": "..." }, ... }. Extract the id with: curl ... | jq -r .frontmatter.id\nUse that exact id as linkedNoteId in your callback below. Do NOT write note files to disk directly.\n\n- On success, run:\ncurl -sS -X POST '${callbackUrl}' -H 'Content-Type: application/json' -d '{"jobId":"${jobId}","status":"completed","result":"<YOUR_RESULT_HERE>","linkedNoteId":"<NOTE_ID_FROM_API_RESPONSE>","linkedNoteTitle":"<NOTE_TITLE>"}'\n\n- On failure, run:\ncurl -sS -X POST '${callbackUrl}' -H 'Content-Type: application/json' -d '{"jobId":"${jobId}","status":"failed","result":"<EXPLAIN_FAILURE_HERE>"}'\n\nRules for result text:\n- Keep it concise (max 200 words) and start success with ✓\n- Do NOT include filesystem paths like /home/... or notes/...\n- linkedNoteId MUST be the exact id returned by POST /api/notes — never guess or fabricate an id\n- Escape any double quotes in JSON values with backslash`;

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

  // Guard against forever-running UI if callback never comes back (5 min timeout).
  const timeoutMs = 5 * 60 * 1000;
  setTimeout(() => {
    const current = agentJobs.get(jobId);
    if (!current || current.status !== "running") return;

    current.status = "failed";
    current.completedAt = new Date().toISOString();
    if (!current.result) {
      current.result = "Action timed out (5 min) waiting for callback. Please rerun.";
    }
    updateActionJobStatus(noteId, idx, current);
    console.warn(`[timeout] Job ${jobId} timed out after ${timeoutMs}ms`);
  }, timeoutMs);

  res.json({ ok: true, jobId, status: "running" });
});

app.post("/api/agent-actions/:noteId/:actionIndex/complete", (req, res) => {
  const { noteId, actionIndex } = req.params;
  const idx = parseInt(actionIndex, 10);
  const note = getNote(noteId);
  if (!note) {
    console.warn(`[callback] Note not found: ${noteId}`);
    return res.status(404).json({ error: "Note not found" });
  }

  const actions = note.frontmatter.suggestedActions || [];
  if (idx < 0 || idx >= actions.length) {
    console.warn(`[callback] Action index out of range: ${idx} for note ${noteId}`);
    return res.status(400).json({ error: "Action index out of range" });
  }

  // Validate request body
  if (!req.body || typeof req.body !== "object") {
    console.warn(`[callback] Invalid request body for ${noteId}/${idx}`);
    return res.status(400).json({ error: "Request body must be JSON object" });
  }

  const action = actions[idx];
  const status = req.body?.status === "failed" ? "failed" : "completed";
  const incomingJobId = typeof req.body?.jobId === "string" ? req.body.jobId : undefined;
  const jobId = action.jobId;

  if (!jobId) {
    console.warn(`[callback] No associated job for ${noteId}/${idx}`);
    return res.status(400).json({ error: "No job is associated with this action" });
  }

  if (incomingJobId && incomingJobId !== jobId) {
    console.warn(`[callback] Job ID mismatch: expected ${jobId}, got ${incomingJobId}`);
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
  const linkedNoteId = typeof req.body?.linkedNoteId === "string" ? req.body.linkedNoteId.trim() : "";
  const linkedNoteTitle = typeof req.body?.linkedNoteTitle === "string" ? req.body.linkedNoteTitle.trim() : "";

  if (resultText) {
    job.result = resultText;
  } else if (status === "failed" && !job.result) {
    job.result = "Action failed in hook execution.";
  } else if (status === "completed" && !job.result) {
    job.result = "Action completed successfully. No detailed result was returned by the agent.";
  }

  if (linkedNoteId) {
    // Validate that the linked note actually exists
    const linkedNote = getNote(linkedNoteId);
    if (!linkedNote) {
      console.warn(`[callback] Linked note does not exist: ${linkedNoteId} (from ${noteId})`);
      // Don't fail the entire callback; just skip the link
    } else {
      job.linkedNoteId = linkedNoteId;
      if (linkedNoteTitle) job.linkedNoteTitle = linkedNoteTitle;

      // Bidirectional connection: frontmatter + graph edge
      const existingConnections = note.frontmatter.connections || [];
      if (!existingConnections.includes(linkedNoteId)) {
        patchNoteFrontmatter(noteId, { connections: [...existingConnections, linkedNoteId] });
      }

      const actionLabel = action.label || action.type || "agent action";
      addConnectionEdge({
        source: noteId,
        target: linkedNoteId,
        relationship: "generated",
        strength: 1.0,
        reason: `Generated by action: ${actionLabel}`,
      });
      console.log(`[callback] Linked note ${linkedNoteId} to action result for ${noteId}`);
    }
  }

  updateActionJobStatus(noteId, idx, job);
  res.json({ ok: true, jobId: job.id, status: job.status, linkedNoteId: linkedNoteId || undefined });
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
  if (job.linkedNoteId) actions[actionIdx].linkedNoteId = job.linkedNoteId;
  if (job.linkedNoteTitle) actions[actionIdx].linkedNoteTitle = job.linkedNoteTitle;
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

// Clean up stalled jobs on startup and periodically
cleanupStalledJobs();
const cleanupInterval = setInterval(() => {
  cleanupStalledJobs();
}, 5 * 60 * 1000); // Every 5 minutes

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
