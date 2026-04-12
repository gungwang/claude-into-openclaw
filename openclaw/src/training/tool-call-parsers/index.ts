/**
 * Tool Call Parsers — Model-specific tool call extraction (Track G — Training Pipeline)
 *
 * Client-side parsers that extract structured tool calls from raw model output text.
 * Used in training/evaluation when raw model text doesn't have pre-parsed tool calls.
 *
 * Each parser handles a specific model family's output format:
 * - hermes: <tool_call>{"name":"...", "arguments":{...}}</tool_call>
 * - deepseek_v3: Unicode-delimited blocks with ```json``` fences
 * - deepseek_v3_1: <tool▁call> ... </tool▁call> with function.name/arguments
 * - qwen: <tool_call>...</tool_call> with ✿FUNCTION✿/✿ARGS✿
 * - llama: <|python_tag|> based function calls
 * - mistral: [TOOL_CALLS] JSON array format
 * - glm45/glm47: GLM-specific tool call tags
 * - kimi_k2: Kimi K2 format
 *
 * Ported from hermes-agent `environments/tool_call_parsers/`.
 */

// ── Types ──

export type ToolCallParsed = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ParseResult = {
  /** Text content with tool call markup stripped (null if no text). */
  content: string | null;
  /** Extracted tool calls (null if no tool calls found). */
  toolCalls: readonly ToolCallParsed[] | null;
};

export type ToolCallParser = {
  readonly name: string;
  parse(text: string): ParseResult;
};

// ── Parser registry ──

const registry = new Map<string, ToolCallParser>();

export function registerParser(parser: ToolCallParser): void {
  registry.set(parser.name, parser);
}

export function getParser(name: string): ToolCallParser | null {
  return registry.get(name) ?? null;
}

export function listParsers(): readonly string[] {
  return [...registry.keys()];
}

// ── Utility ──

let callCounter = 0;

function generateCallId(): string {
  return `call_${(++callCounter).toString(16).padStart(8, "0")}`;
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ── Hermes parser ──

const HERMES_PATTERN = /<tool_call>\s*(.*?)\s*<\/tool_call>|<tool_call>\s*(.*)/gs;

registerParser({
  name: "hermes",
  parse(text: string): ParseResult {
    if (!text.includes("<tool_call>")) return { content: text, toolCalls: null };

    const calls: ToolCallParsed[] = [];
    HERMES_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = HERMES_PATTERN.exec(text)) !== null) {
      const rawJson = (match[1] || match[2] || "").trim();
      if (!rawJson) continue;

      const data = tryParseJson(rawJson) as { name?: string; arguments?: unknown } | null;
      if (!data?.name) continue;

      calls.push({
        id: generateCallId(),
        type: "function",
        function: {
          name: data.name,
          arguments: JSON.stringify(data.arguments ?? {}),
        },
      });
    }

    if (calls.length === 0) return { content: text, toolCalls: null };

    const content = text.slice(0, text.indexOf("<tool_call>")).trim() || null;
    return { content, toolCalls: calls };
  },
});

// ── DeepSeek V3 parser ──

const DEEPSEEK_V3_START = "<｜tool▁calls▁begin｜>";
const DEEPSEEK_V3_CALL = /<｜tool▁call▁begin｜>(?:.*?)<｜tool▁sep｜>(.*?)\s*```json\s*(.*?)\s*```\s*<｜tool▁call▁end｜>/gs;

registerParser({
  name: "deepseek_v3",
  parse(text: string): ParseResult {
    if (!text.includes(DEEPSEEK_V3_START)) return { content: text, toolCalls: null };

    const calls: ToolCallParsed[] = [];
    DEEPSEEK_V3_CALL.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = DEEPSEEK_V3_CALL.exec(text)) !== null) {
      const funcName = (match[1] || "").trim();
      const funcArgs = (match[2] || "").trim();
      if (!funcName) continue;

      calls.push({
        id: generateCallId(),
        type: "function",
        function: { name: funcName, arguments: funcArgs },
      });
    }

    if (calls.length === 0) return { content: text, toolCalls: null };

    const content = text.slice(0, text.indexOf(DEEPSEEK_V3_START)).trim() || null;
    return { content, toolCalls: calls };
  },
});

// ── DeepSeek V3.1 parser ──

const DEEPSEEK_V31_CALL = /<tool▁call>\s*(.*?)\s*<\/tool▁call>/gs;

registerParser({
  name: "deepseek_v3_1",
  parse(text: string): ParseResult {
    if (!text.includes("<tool▁call>")) return { content: text, toolCalls: null };

    const calls: ToolCallParsed[] = [];
    DEEPSEEK_V31_CALL.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = DEEPSEEK_V31_CALL.exec(text)) !== null) {
      const raw = (match[1] || "").trim();
      const data = tryParseJson(raw) as { name?: string; arguments?: unknown } | null;
      if (!data?.name) continue;

      calls.push({
        id: generateCallId(),
        type: "function",
        function: {
          name: data.name,
          arguments: JSON.stringify(data.arguments ?? {}),
        },
      });
    }

    if (calls.length === 0) return { content: text, toolCalls: null };

    const content = text.slice(0, text.indexOf("<tool▁call>")).trim() || null;
    return { content, toolCalls: calls };
  },
});

// ── Qwen parser ──

const QWEN_PATTERN = /✿FUNCTION✿:\s*(.*?)\n✿ARGS✿:\s*(.*?)(?=✿FUNCTION✿|$)/gs;

registerParser({
  name: "qwen",
  parse(text: string): ParseResult {
    if (!text.includes("✿FUNCTION✿")) return { content: text, toolCalls: null };

    const calls: ToolCallParsed[] = [];
    QWEN_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = QWEN_PATTERN.exec(text)) !== null) {
      const funcName = (match[1] || "").trim();
      const funcArgs = (match[2] || "").trim();
      if (!funcName) continue;

      calls.push({
        id: generateCallId(),
        type: "function",
        function: { name: funcName, arguments: funcArgs },
      });
    }

    if (calls.length === 0) return { content: text, toolCalls: null };

    const content = text.slice(0, text.indexOf("✿FUNCTION✿")).trim() || null;
    return { content, toolCalls: calls };
  },
});

// ── Llama parser ──

registerParser({
  name: "llama",
  parse(text: string): ParseResult {
    if (!text.includes("<|python_tag|>")) return { content: text, toolCalls: null };

    const parts = text.split("<|python_tag|>");
    const contentPart = parts[0].trim() || null;
    const calls: ToolCallParsed[] = [];

    for (let i = 1; i < parts.length; i++) {
      const raw = parts[i].trim();
      const data = tryParseJson(raw) as { name?: string; parameters?: unknown } | null;
      if (!data?.name) continue;

      calls.push({
        id: generateCallId(),
        type: "function",
        function: {
          name: data.name,
          arguments: JSON.stringify(data.parameters ?? {}),
        },
      });
    }

    if (calls.length === 0) return { content: text, toolCalls: null };
    return { content: contentPart, toolCalls: calls };
  },
});

// ── Mistral parser ──

registerParser({
  name: "mistral",
  parse(text: string): ParseResult {
    if (!text.includes("[TOOL_CALLS]")) return { content: text, toolCalls: null };

    const idx = text.indexOf("[TOOL_CALLS]");
    const contentPart = text.slice(0, idx).trim() || null;
    const jsonPart = text.slice(idx + "[TOOL_CALLS]".length).trim();

    const parsed = tryParseJson(jsonPart) as Array<{
      name?: string;
      arguments?: unknown;
      id?: string;
    }> | null;

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { content: text, toolCalls: null };
    }

    const calls: ToolCallParsed[] = parsed
      .filter((tc) => tc.name)
      .map((tc) => ({
        id: tc.id ?? generateCallId(),
        type: "function" as const,
        function: {
          name: tc.name!,
          arguments: JSON.stringify(tc.arguments ?? {}),
        },
      }));

    if (calls.length === 0) return { content: text, toolCalls: null };
    return { content: contentPart, toolCalls: calls };
  },
});

// ── GLM 4.5 parser ──

const GLM45_PATTERN = /<\|tool_call\|>\s*(.*?)\s*(?:<\|\/tool_call\|>|$)/gs;

registerParser({
  name: "glm45",
  parse(text: string): ParseResult {
    if (!text.includes("<|tool_call|>")) return { content: text, toolCalls: null };

    const calls: ToolCallParsed[] = [];
    GLM45_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = GLM45_PATTERN.exec(text)) !== null) {
      const raw = (match[1] || "").trim();
      const data = tryParseJson(raw) as { name?: string; arguments?: unknown } | null;
      if (!data?.name) continue;

      calls.push({
        id: generateCallId(),
        type: "function",
        function: {
          name: data.name,
          arguments: JSON.stringify(data.arguments ?? {}),
        },
      });
    }

    if (calls.length === 0) return { content: text, toolCalls: null };

    const content = text.slice(0, text.indexOf("<|tool_call|>")).trim() || null;
    return { content, toolCalls: calls };
  },
});

// ── GLM 4.7 parser ──

const GLM47_PATTERN = /<tool_call>\s*(.*?)\s*<\/tool_call>/gs;

registerParser({
  name: "glm47",
  parse(text: string): ParseResult {
    // GLM 4.7 uses same tags as Hermes but different interior format
    if (!text.includes("<tool_call>")) return { content: text, toolCalls: null };

    const calls: ToolCallParsed[] = [];
    GLM47_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = GLM47_PATTERN.exec(text)) !== null) {
      const raw = (match[1] || "").trim();
      const data = tryParseJson(raw) as { name?: string; function?: { name?: string; arguments?: unknown }; arguments?: unknown } | null;
      if (!data) continue;

      const name = data.name ?? data.function?.name;
      const args = data.arguments ?? data.function?.arguments;
      if (!name) continue;

      calls.push({
        id: generateCallId(),
        type: "function",
        function: {
          name,
          arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}),
        },
      });
    }

    if (calls.length === 0) return { content: text, toolCalls: null };

    const content = text.slice(0, text.indexOf("<tool_call>")).trim() || null;
    return { content, toolCalls: calls };
  },
});

// ── Kimi K2 parser ──

const KIMI_PATTERN = /<tool_call>(.*?)<\/tool_call>/gs;

registerParser({
  name: "kimi_k2",
  parse(text: string): ParseResult {
    if (!text.includes("<tool_call>")) return { content: text, toolCalls: null };

    const calls: ToolCallParsed[] = [];
    KIMI_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = KIMI_PATTERN.exec(text)) !== null) {
      const raw = (match[1] || "").trim();
      const data = tryParseJson(raw) as { name?: string; arguments?: unknown } | null;
      if (!data?.name) continue;

      calls.push({
        id: generateCallId(),
        type: "function",
        function: {
          name: data.name,
          arguments: JSON.stringify(data.arguments ?? {}),
        },
      });
    }

    if (calls.length === 0) return { content: text, toolCalls: null };

    const content = text.slice(0, text.indexOf("<tool_call>")).trim() || null;
    return { content, toolCalls: calls };
  },
});

// ── LongCat parser ──

registerParser({
  name: "longcat",
  parse(text: string): ParseResult {
    // LongCat uses Hermes format — delegate to hermes parser
    const hermes = getParser("hermes");
    if (!hermes) return { content: text, toolCalls: null };
    return hermes.parse(text);
  },
});

// ── Qwen3-Coder parser ──

const QWEN3_PATTERN = /<tool_call>\s*(.*?)\s*<\/tool_call>/gs;

registerParser({
  name: "qwen3_coder",
  parse(text: string): ParseResult {
    if (!text.includes("<tool_call>")) return { content: text, toolCalls: null };

    const calls: ToolCallParsed[] = [];
    QWEN3_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = QWEN3_PATTERN.exec(text)) !== null) {
      const raw = (match[1] || "").trim();
      const data = tryParseJson(raw) as { name?: string; arguments?: unknown } | null;
      if (!data?.name) continue;

      calls.push({
        id: generateCallId(),
        type: "function",
        function: {
          name: data.name,
          arguments: JSON.stringify(data.arguments ?? {}),
        },
      });
    }

    if (calls.length === 0) return { content: text, toolCalls: null };

    const content = text.slice(0, text.indexOf("<tool_call>")).trim() || null;
    return { content, toolCalls: calls };
  },
});
