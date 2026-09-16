"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Template = {
  name: string;
  subject: string;
  body_html: string;
  updated_at: string | null;
  updated_by: string | null;
};

type MergeField = { tag: string; label: string };

function ToolbarButton({
  onClick,
  active,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`px-2 py-1 text-sm rounded border ${
        active ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-700 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, mergeFields }: { editor: Editor | null; mergeFields: MergeField[] }) {
  if (!editor) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border border-gray-300 border-b-0 rounded-t bg-gray-50 p-2">
      <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        B
      </ToolbarButton>
      <ToolbarButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <span className="underline">U</span>
      </ToolbarButton>
      <ToolbarButton
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </ToolbarButton>
      <ToolbarButton
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. List
      </ToolbarButton>
      <ToolbarButton
        title="Heading"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </ToolbarButton>
      <div className="w-px self-stretch bg-gray-300 mx-1" />
      <select
        defaultValue=""
        onChange={(e) => {
          const tag = e.target.value;
          if (tag) editor.chain().focus().insertContent(`{{${tag}}}`).run();
          e.target.value = "";
        }}
        className="border border-gray-300 rounded px-2 py-1 text-sm"
      >
        <option value="" disabled>
          Insert merge field...
        </option>
        {mergeFields.map((f) => (
          <option key={f.tag} value={f.tag}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function NotificationsClient() {
  const [subject, setSubject] = useState("");
  const [mergeFields, setMergeFields] = useState<MergeField[]>([]);
  const [meta, setMeta] = useState<{ updated_at: string | null; updated_by: string | null }>({
    updated_at: null,
    updated_by: null,
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success" | "warning"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Underline],
    content: "",
    editorProps: {
      attributes: { class: "prose-sm max-w-none min-h-[400px] px-4 py-3 focus:outline-none" },
    },
  });

  useEffect(() => {
    async function load() {
      const [tplRes, fieldsRes] = await Promise.all([
        fetch(`${API_URL}/api/notifications/template`, { credentials: "include" }),
        fetch(`${API_URL}/api/notifications/merge-fields`, { credentials: "include" }),
      ]);
      if (tplRes.ok) {
        const tpl: Template = await tplRes.json();
        setSubject(tpl.subject);
        setMeta({ updated_at: tpl.updated_at, updated_by: tpl.updated_by });
        editor?.commands.setContent(tpl.body_html);
      }
      if (fieldsRes.ok) {
        const data = await fieldsRes.json();
        setMergeFields(data.fields);
      }
      setLoaded(true);
    }
    if (editor && !loaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  async function handleSave() {
    if (!editor) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/notifications/template`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body_html: editor.getHTML() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage({ kind: "error", text: body.detail ?? "Failed to save" });
        return;
      }
      const tpl: Template = await res.json();
      setMeta({ updated_at: tpl.updated_at, updated_by: tpl.updated_by });
      setMessage({ kind: "success", text: "Template saved." });
    } catch {
      setMessage({ kind: "error", text: "Failed to reach the API" });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/api/notifications/template/upload`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage({ kind: "error", text: body.detail ?? "Failed to parse that file" });
        return;
      }
      const data = await res.json();
      editor?.commands.setContent(data.body_html);
      if (data.warnings?.length) {
        setMessage({ kind: "warning", text: data.warnings.join(" ") });
      } else {
        setMessage({ kind: "success", text: "Loaded from upload -- review below, then Save to keep it." });
      }
    } catch {
      setMessage({ kind: "error", text: "Failed to reach the API" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-3 py-2 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? "Reading..." : "Upload a .docx template"}
        </button>
        <input ref={fileInputRef} type="file" accept=".docx" onChange={handleUpload} className="hidden" />
        {meta.updated_at && (
          <span className="text-xs text-gray-400">
            Last saved {new Date(meta.updated_at).toLocaleString()}
            {meta.updated_by ? ` by ${meta.updated_by}` : ""}
          </span>
        )}
      </div>

      {message && (
        <div
          className={`text-sm rounded px-3 py-2 mb-4 border ${
            message.kind === "error"
              ? "bg-red-50 border-red-200 text-red-700"
              : message.kind === "warning"
              ? "bg-yellow-50 border-yellow-200 text-yellow-800"
              : "bg-green-50 border-green-200 text-green-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <label className="block text-sm font-medium mb-1">Subject</label>
      <input
        type="text"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-4"
      />

      <label className="block text-sm font-medium mb-1">Body</label>
      <Toolbar editor={editor} mergeFields={mergeFields} />
      <div className="border border-gray-300 rounded-b">
        <EditorContent editor={editor} />
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !loaded}
          className="bg-gray-900 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save template"}
        </button>
      </div>
    </div>
  );
}
