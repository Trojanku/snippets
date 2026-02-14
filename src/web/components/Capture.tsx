import { useState } from "react";
import { useApp } from "../App.tsx";
import { api } from "../lib/api.ts";

export function Capture() {
  const { openNote } = useApp();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    try {
      const note = await api.createNote(content.trim());
      setContent("");
      await openNote(note.frontmatter.id);
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
        className="control min-h-[320px] w-full resize-y border-line/80 bg-paper/45 p-4 font-serif text-[20px] leading-[1.75] text-ink"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What needs to be remembered?"
        autoFocus
        rows={12}
      />
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
