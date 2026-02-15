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

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}

function ToolbarButton({ label, active, onClick, disabled, title }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={`rich-toolbar-btn ${active ? "rich-toolbar-btn-active" : ""}`}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      {label}
    </button>
  );
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
      <div className="rich-toolbar">
        <ToolbarButton
          label="P"
          title="Paragraph"
          active={editor.isActive("paragraph")}
          onClick={() => editor.chain().focus().setParagraph().run()}
        />
        <ToolbarButton
          label="H1"
          title="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolbarButton
          label="H2"
          title="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          label="B"
          title="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="I"
          title="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="Code"
          title="Inline code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
        <ToolbarButton
          label="UL"
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="OL"
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label="Quote"
          title="Blockquote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          label="Block"
          title="Code block"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <ToolbarButton
          label="Undo"
          title="Undo"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run()}
        />
        <ToolbarButton
          label="Redo"
          title="Redo"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run()}
        />
      </div>

      <div className="rich-editor-body">
        {editor.isEmpty && <p className="rich-editor-placeholder">{placeholder}</p>}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
