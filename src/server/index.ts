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
} from "./store.js";

const PENDING_DIR = path.resolve(".agent/pending");

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

app.post("/api/notes", (req, res) => {
  const { content } = req.body;
  if (!content || typeof content !== "string") {
    return res.status(400).json({ error: "content is required" });
  }
  const note = createNote(content);
  
  // Queue for AI processing
  fs.mkdirSync(PENDING_DIR, { recursive: true });
  fs.writeFileSync(path.join(PENDING_DIR, note.frontmatter.id), "");
  console.log(`[queue] Note ${note.frontmatter.id} queued for processing`);
  
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

app.delete("/api/pending/:id", (req, res) => {
  // Mark note as processed (remove from queue)
  const filePath = path.join(PENDING_DIR, req.params.id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`[queue] Note ${req.params.id} marked as processed`);
  }
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

// --- Chokidar Watcher ---

// Ensure directories exist
fs.mkdirSync(path.resolve("notes"), { recursive: true });
fs.mkdirSync(PENDING_DIR, { recursive: true });

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
