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
    <form className="capture" onSubmit={handleSubmit}>
      <div className="capture-sheet">
        <div className="capture-label">Capture</div>
        <textarea
          className="capture-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What needs to be remembered?"
          autoFocus
          rows={12}
        />
      </div>
      <div className="capture-actions">
        <span className="capture-hint">Write freely. Processing runs automatically.</span>
        <button className="capture-btn" type="submit" disabled={saving || !content.trim()}>
          {saving ? "Saving..." : "Save Note"}
        </button>
      </div>
    </form>
  );
}
