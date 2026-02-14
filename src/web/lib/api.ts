const BASE = "/api";

export interface NoteSummary {
  id: string;
  created: string;
  updated?: string;
  title?: string;
  themes?: string[];
  summary?: string;
  connections?: string[];
  suggestedActions?: { type: string; label: string }[];
  status?: string;
  kind?: "knowledge" | "action" | "idea" | "journal" | "reference" | string;
  actionability?: "none" | "maybe" | "clear" | string;
  classificationConfidence?: number;
  processingError?: string;
}

export interface FullNote {
  frontmatter: NoteSummary;
  content: string;
}

export interface ConnectionEdge {
  source: string;
  target: string;
  relationship: string;
  strength: number;
  reason: string;
}

export interface ConnectionGraph {
  version: number;
  edges: ConnectionEdge[];
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  listNotes: () => json<NoteSummary[]>("/notes"),
  getNote: (id: string) => json<FullNote>(`/notes/${encodeURIComponent(id)}`),
  createNote: async (content: string): Promise<FullNote> => {
    const res = await fetch(`${BASE}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },
  getConnections: () => json<ConnectionGraph>("/connections"),
  getMemory: () => json<{ content: string }>("/memory"),
  getMission: () => json<{ content: string }>("/mission"),
};

export type SSEHandler = (event: string, data: string) => void;

export function subscribeSSE(handler: SSEHandler): () => void {
  const source = new EventSource(`${BASE}/events`);
  source.onmessage = (e) => handler("message", e.data);
  for (const evt of [
    "notes-updated",
    "connections-updated",
    "memory-updated",
    "mission-updated",
  ]) {
    source.addEventListener(evt, ((e: MessageEvent) => {
      handler(evt, e.data);
    }) as EventListener);
  }
  return () => source.close();
}
