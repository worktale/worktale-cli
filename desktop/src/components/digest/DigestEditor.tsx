import { useState, useEffect, useRef, useCallback } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import * as api from "../../lib/api";
import { getDateString, formatDate, addDays } from "../../lib/utils";

interface DigestEditorProps {
  repoId: number;
}

export function DigestEditor({ repoId }: DigestEditorProps) {
  const [currentDate, setCurrentDate] = useState(getDateString());
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const todayStr = getDateString();
  const isToday = currentDate === todayStr;

  // Load existing digest for date
  const loadDigest = useCallback(async () => {
    try {
      const summary = await api.getDailySummary(repoId, currentDate);
      const text = summary?.ai_draft ?? summary?.user_notes ?? "";
      setContent(text);
      setIsPublished(summary?.published ?? false);
      setPublishResult(null);

      // Update CodeMirror editor
      if (viewRef.current) {
        viewRef.current.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: text },
        });
      }
    } catch (e) {
      console.error("Failed to load digest:", e);
    }
  }, [repoId, currentDate]);

  useEffect(() => {
    loadDigest();
  }, [loadDigest]);

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;

    const theme = EditorView.theme({
      "&": { height: "100%", fontSize: "14px" },
      ".cm-scroller": { fontFamily: "var(--font-mono)", overflow: "auto" },
      ".cm-content": { padding: "16px 0" },
      ".cm-line": { padding: "0 16px" },
    });

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setContent(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        markdown(),
        oneDark,
        syntaxHighlighting(defaultHighlightStyle),
        theme,
        updateListener,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const digest = await api.generateDigest(repoId, currentDate);
      setContent(digest);
      if (viewRef.current) {
        viewRef.current.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: digest },
        });
      }
    } catch (e) {
      console.error("Failed to generate digest:", e);
    }
    setGenerating(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateAiDraft(repoId, currentDate, content);
    } catch (e) {
      console.error("Failed to save digest:", e);
    }
    setSaving(false);
  }

  async function handlePublish() {
    setPublishing(true);
    setPublishResult(null);
    try {
      // Save first
      await api.updateAiDraft(repoId, currentDate, content);
      // Then publish
      const url = await api.cloudPublishDaily(repoId, currentDate);
      setPublishResult(url);
      setIsPublished(true);
    } catch (e) {
      setPublishResult(`Error: ${e}`);
    }
    setPublishing(false);
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Date navigation */}
          <button
            onClick={() => setCurrentDate((d) => addDays(d, -1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-1 hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h2 className="text-sm font-semibold text-text-primary min-w-[200px] text-center">
            {formatDate(currentDate)}
            {isToday && <span className="text-streak ml-1 text-xs font-normal">(today)</span>}
          </h2>
          <button
            onClick={() => setCurrentDate((d) => addDays(d, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-1 hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>

          {isPublished && (
            <span className="flex items-center gap-1 text-positive text-xs bg-positive/10 px-2 py-1 rounded-full">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              Published
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {generating ? (
              <span className="animate-spin">&#8987;</span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            )}
            Generate
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="px-4 py-2 bg-brand hover:bg-brand/80 text-surface font-semibold rounded-lg text-sm transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {publishing ? (
              <span className="animate-spin">&#8987;</span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
            )}
            Publish
          </button>
        </div>
      </div>

      {/* Publish result */}
      {publishResult && (
        <div className={`px-4 py-2 rounded-lg text-sm ${publishResult.startsWith("Error") ? "bg-negative/10 text-negative" : "bg-positive/10 text-positive"}`}>
          {publishResult.startsWith("Error") ? publishResult : (
            <>Published to <span className="font-bold">{publishResult}</span></>
          )}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 glass overflow-hidden rounded-xl">
        <div ref={editorRef} className="h-full" />
      </div>

      {/* Footer hints */}
      <div className="text-text-dim text-xs flex gap-6">
        <span>Markdown supported</span>
        <span>&#8226; Generate creates a template digest from today's commits</span>
        <span>&#8226; Publish syncs to Worktale Cloud</span>
      </div>
    </div>
  );
}
