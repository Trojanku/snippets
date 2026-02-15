import { useState } from "react";
import { useApp } from "../App.tsx";
import { api } from "../lib/api.ts";

export function Capture() {
  const { openNote } = useApp();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!content.trim()) return;
    setSaving(true);
    try {
      const note = await api.createNote(content.trim());
      setContent("");
      await openNote(note.frontmatter.id);
    } catch (err) {
      setError(`Failed to save: ${err instanceof Error ? err.message : String(err)}`);
      console.error("[capture] Error creating note:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="surface flex flex-col gap-4" onSubmit={handleSubmit}>
      <div>
        <p className="text-xs uppercase tracking-widest text-ink-soft">Capture</p>
        <h2 className="font-serif text-6xl font-semibold text-ink">Write it once</h2>
      </div>
      <textarea
        className="h-80 control min-h-[120px] w-full resize-y border-line/80 bg-paper/45 p-4 font-serif text-[20px] leading-[1.75] text-ink"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What needs to be remembered?"
        autoFocus
        rows={12}
      />
      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-widest text-ink-soft">
          Write freely. Processing runs automatically.
        </span>
        <button className="btn-accent" type="submit" disabled={saving || !content.trim()}>
          {saving ? "Saving..." : "Save Note"}
        </button>
      </div>
    </form>
  );
}
