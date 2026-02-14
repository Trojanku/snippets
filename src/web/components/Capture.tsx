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
      openNote(note.frontmatter.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="capture" onSubmit={handleSubmit}>
      <textarea
        className="capture-input"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's on your mind?"
        autoFocus
        rows={12}
      />
      <button className="capture-btn" type="submit" disabled={saving || !content.trim()}>
        {saving ? "Saving..." : "Save Note"}
      </button>
    </form>
  );
}
