import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { marked } from "marked";
import TurndownService from "turndown";
import { useEffect, useMemo, useRef } from "react";

interface RichMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

function normalizeMarkdown(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function markdownToHtml(input: string): string {
  const parsed = marked.parse(input || "", {
    gfm: true,
    breaks: true,
  });
  if (typeof parsed === "string") return parsed;
  return "";
}

function htmlToMarkdown(input: string, turndown: TurndownService): string {
  return normalizeMarkdown(turndown.turndown(input));
}

export function RichMarkdownEditor({
  value,
  onChange,
  placeholder = "Write freely. Autosave and enrichment run quietly.",
  autoFocus = false,
}: RichMarkdownEditorProps) {
  const turndown = useMemo(
    () =>
      new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
        bulletListMarker: "-",
        emDelimiter: "*",
      }),
    []
  );
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
    ],
    content: markdownToHtml(value || ""),
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: "rich-editor-content",
      },
    },
    onUpdate: ({ editor: current }) => {
      const nextMarkdown = htmlToMarkdown(current.getHTML(), turndown);
      if (nextMarkdown !== normalizeMarkdown(valueRef.current)) {
        onChange(nextMarkdown);
      }
    },
  });

  useEffect(() => {
    if (!editor) return;
    const currentMarkdown = htmlToMarkdown(editor.getHTML(), turndown);
    const incomingMarkdown = normalizeMarkdown(value);
    if (currentMarkdown !== incomingMarkdown) {
      editor.commands.setContent(markdownToHtml(value || ""), { emitUpdate: false });
    }
  }, [editor, value, turndown]);

  if (!editor) return null;

  return (
    <div className="rich-editor-shell">
      <div className="rich-editor-body">
        {editor.isEmpty && <p className="rich-editor-placeholder">{placeholder}</p>}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
