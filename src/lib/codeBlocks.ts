export interface CodeBlock {
  language: string;
  code: string;
}

export function extractCodeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const pattern = /```([A-Za-z0-9_-]*)\r?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    blocks.push({
      language: match[1]?.trim() || "text",
      code: match[2].trim()
    });
  }

  return blocks;
}
