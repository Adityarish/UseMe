"use client";

import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { sql } from "@codemirror/lang-sql";
import type { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";

const extensions: Record<string, () => Extension> = {
  markdown, json, javascript, typescript: () => javascript({ typescript: true }), python, java,
  c: cpp, "c++": cpp, html, css, sql, bash: () => StreamLanguage.define(shell),
};

export function CodeEditor({ value, language, onChange, readOnly = false }: { value: string; language: string; onChange?: (value: string) => void; readOnly?: boolean }) {
  const extension = extensions[language]?.();
  return (
    <CodeMirror
      value={value}
      height={readOnly ? "auto" : "280px"}
      minHeight={readOnly ? "80px" : undefined}
      extensions={extension ? [extension] : []}
      onChange={onChange}
      editable={!readOnly}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: !readOnly }}
      className="overflow-hidden rounded-2xl border border-black/10 text-left dark:border-white/10"
    />
  );
}
