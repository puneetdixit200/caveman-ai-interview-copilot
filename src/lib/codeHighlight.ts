export type CodeTokenType = "plain" | "keyword" | "string" | "number" | "comment" | "operator";

export interface CodeToken {
  type: CodeTokenType;
  text: string;
}

const LANGUAGE_LABELS: Record<string, string> = {
  "": "Plain Text",
  text: "Plain Text",
  txt: "Plain Text",
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "React JSX",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "React TSX",
  py: "Python",
  python: "Python",
  rs: "Rust",
  rust: "Rust",
  go: "Go",
  java: "Java",
  cs: "C#",
  csharp: "C#",
  cpp: "C++",
  c: "C",
  sql: "SQL",
  sh: "Shell",
  bash: "Shell",
  powershell: "PowerShell",
  ps1: "PowerShell",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML"
};

const KEYWORDS = new Set([
  "async",
  "await",
  "break",
  "case",
  "class",
  "const",
  "continue",
  "def",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "fn",
  "for",
  "from",
  "function",
  "if",
  "impl",
  "import",
  "in",
  "interface",
  "let",
  "match",
  "mut",
  "new",
  "null",
  "private",
  "public",
  "return",
  "self",
  "static",
  "struct",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "undefined",
  "use",
  "var",
  "while"
]);

export function displayLanguageLabel(language: string): string {
  const normalized = normalizeLanguage(language);
  return LANGUAGE_LABELS[normalized] ?? normalized.toUpperCase();
}

export function normalizeLanguage(language: string): string {
  return language.trim().toLowerCase();
}

export function highlightCode(code: string, language: string): CodeToken[] {
  if (!code) {
    return [];
  }

  const normalizedLanguage = normalizeLanguage(language);
  const tokens: CodeToken[] = [];
  let index = 0;

  while (index < code.length) {
    const rest = code.slice(index);
    const commentMatch = readComment(rest, normalizedLanguage);
    if (commentMatch) {
      tokens.push({ type: "comment", text: commentMatch });
      index += commentMatch.length;
      continue;
    }

    const stringMatch = readString(rest);
    if (stringMatch) {
      tokens.push({ type: "string", text: stringMatch });
      index += stringMatch.length;
      continue;
    }

    const numberMatch = rest.match(/^\b\d+(?:\.\d+)?\b/);
    if (numberMatch) {
      tokens.push({ type: "number", text: numberMatch[0] });
      index += numberMatch[0].length;
      continue;
    }

    const wordMatch = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (wordMatch) {
      const word = wordMatch[0];
      tokens.push({ type: KEYWORDS.has(word) ? "keyword" : "plain", text: word });
      index += word.length;
      continue;
    }

    const operatorMatch = rest.match(/^(=>|==={0,1}|!=={0,1}|<=|>=|&&|\|\||[+\-*/%=<>!&|?:;.,()[\]{}])/);
    if (operatorMatch) {
      tokens.push({ type: "operator", text: operatorMatch[0] });
      index += operatorMatch[0].length;
      continue;
    }

    tokens.push({ type: "plain", text: code[index] });
    index += 1;
  }

  return mergeAdjacentTokens(tokens);
}

function readComment(rest: string, language: string): string | undefined {
  if (rest.startsWith("//")) {
    return rest.match(/^\/\/[^\n\r]*/)?.[0];
  }

  if (rest.startsWith("/*")) {
    const end = rest.indexOf("*/", 2);
    return end >= 0 ? rest.slice(0, end + 2) : rest;
  }

  if ((language === "python" || language === "py" || language === "sh" || language === "bash") && rest.startsWith("#")) {
    return rest.match(/^#[^\n\r]*/)?.[0];
  }

  return undefined;
}

function readString(rest: string): string | undefined {
  const quote = rest[0];
  if (quote !== '"' && quote !== "'" && quote !== "`") {
    return undefined;
  }

  let escaped = false;
  for (let index = 1; index < rest.length; index += 1) {
    const char = rest[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === quote) {
      return rest.slice(0, index + 1);
    }
    if (quote !== "`" && (char === "\n" || char === "\r")) {
      return rest.slice(0, index);
    }
  }

  return rest;
}

function mergeAdjacentTokens(tokens: CodeToken[]): CodeToken[] {
  const merged: CodeToken[] = [];

  for (const token of tokens) {
    const previous = merged[merged.length - 1];
    if (previous?.type === token.type) {
      previous.text += token.text;
      continue;
    }

    merged.push({ ...token });
  }

  return merged;
}
