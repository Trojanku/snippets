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
    <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
      <div className="border border-line rounded-2xl px-5.5 py-5.5 bg-gradient-to-b from-white/99 to-white/98 shadow-lg">
        <div className="text-xs tracking-widest uppercase text-ink-soft mb-2.5">Capture</div>
        <textarea
          className="w-full p-0 text-[20px] leading-[1.75] font-serif text-ink bg-transparent placeholder-gray-400 focus:outline-none resize-vertical"
          style={{ minHeight: "320px" }}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What needs to be remembered?"
          autoFocus
          rows={12}
        />
      </div>
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <span className="text-xs tracking-widest uppercase text-ink-soft">Write freely. Processing runs automatically.</span>
        <button
          className="px-4.5 py-2.5 bg-green-800 text-white rounded-full text-xs tracking-widest uppercase cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed hover:bg-green-900 transition-colors duration-120"
          type="submit"
          disabled={saving || !content.trim()}
        >
          {saving ? "Saving..." : "Save Note"}
        </button>
      </div>
    </form>
  );
}
