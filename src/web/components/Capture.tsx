import { useMemo, useState } from "react";
import { useApp } from "../App.tsx";
import { api } from "../lib/api.ts";

export function Capture() {
  const { state, openNote } = useApp();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  const recentStream = useMemo(
    () => [...state.notes].sort((a, b) => +new Date(b.created) - +new Date(a.created)).slice(0, 6),
    [state.notes]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!content.trim()) return;
    setSaving(true);
    try {
      const note = await api.createNote(content.trim());
      setContent("");
      setLastSavedId(note.frontmatter.id);
      // Keep user in flow; no forced navigation jump.
    } catch (err) {
      setError(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
      console.error("[capture] Error creating note:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="surface flex flex-col gap-4">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div>
          <p className="text-xs uppercase tracking-widest text-ink-soft">Capture</p>
          <h2 className="font-serif text-6xl font-semibold text-ink">Live stream writing</h2>
        </div>
        <textarea
          className="h-80 control min-h-[120px] w-full resize-y border-line/80 bg-paper/45 p-4 font-serif text-[20px] leading-[1.75] text-ink"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write now. AI enriches in the background."
          autoFocus
          rows={12}
        />
        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}
        {lastSavedId && (
          <div className="rounded-lg border border-success/40 bg-accent-soft/20 px-3 py-2 text-sm text-success">
            Saved. Continue writing — processing runs quietly in the background.
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-widest text-ink-soft">
            Edit first. AI updates appear progressively.
          </span>
          <button className="btn-accent" type="submit" disabled={saving || !content.trim()}>
            {saving ? "Saving..." : "Add to Stream"}
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-line/70 bg-paper/35 p-3">
        <p className="mb-2 text-xs uppercase tracking-widest text-ink-soft">Recent stream</p>
        <div className="flex flex-col gap-1.5">
          {recentStream.map((n) => (
            <button
              key={n.id}
              onClick={() => void openNote(n.id)}
              className="flex items-center justify-between rounded-lg border border-line/60 bg-paper/50 px-2.5 py-2 text-left hover:border-focus/45"
            >
              <span className="truncate pr-3 text-sm text-ink">{n.title || n.id}</span>
              <span className={`status status-${n.status || "raw"}`}>{n.status || "raw"}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
