import { Clipboard, Code2, Copy, Keyboard } from "lucide-react";
import { useMemo, useState } from "react";
import { extractCodeSuggestions } from "../../lib/codeBlocks";
import { typeTextIntoActiveWindow } from "../../lib/tauri";
import type { AIResponseRecord } from "../../types/session";
import { Button } from "../common/Button";

interface CodeAssistantPanelProps {
  responses: AIResponseRecord[];
}

export function CodeAssistantPanel({ responses }: CodeAssistantPanelProps) {
  const [status, setStatus] = useState("Ready");
  const suggestions = useMemo(() => extractCodeSuggestions(responses), [responses]);
  const latestResponse = responses.find((response) => response.response.trim().length > 0);

  async function copyText(text: string, label: string) {
    if (!navigator.clipboard) {
      setStatus("Clipboard is not available in this environment");
      return;
    }

    await navigator.clipboard.writeText(text);
    setStatus(`${label} copied`);
  }

  async function typeIntoActiveEditor(text: string, label: string) {
    try {
      const typed = await typeTextIntoActiveWindow(text);
      setStatus(`Typed ${typed.characterCount} ${label.toLowerCase()} characters into the active editor`);
    } catch (error) {
      setStatus(`Could not type ${label.toLowerCase()}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <section className="panel code-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Editor</p>
          <h2>Code Assistant</h2>
        </div>
        <Code2 size={18} />
      </div>

      <div className="code-actions">
        <Button
          icon={<Clipboard size={16} />}
          onClick={() => latestResponse && copyText(latestResponse.response, "Latest answer")}
          disabled={!latestResponse}
        >
          Copy Latest Answer
        </Button>
      </div>

      {suggestions.length > 0 ? (
        <div className="code-list">
          {suggestions.map((suggestion, index) => (
            <article className="code-snippet" key={`${suggestion.responseId}-${index}`}>
              <div className="code-snippet-header">
                <span>{suggestion.language}</span>
                <Button icon={<Copy size={16} />} onClick={() => copyText(suggestion.code, "Code")}>
                  Copy Code
                </Button>
                <Button icon={<Keyboard size={16} />} onClick={() => typeIntoActiveEditor(suggestion.code, "Code")}>
                  Type Code
                </Button>
              </div>
              <pre>
                <code>{suggestion.code}</code>
              </pre>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-copy">Code blocks from AI answers appear here for quick copy into your editor.</p>
      )}

      <p className="page-status">{status}</p>
    </section>
  );
}
