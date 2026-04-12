import { describe, expect, it } from "vitest";
import {
  registerParser,
  getParser,
  listParsers,
  type ParseResult,
} from "./index.js";

describe("parser registry", () => {
  it("lists all built-in parsers", () => {
    const names = listParsers();
    expect(names).toContain("hermes");
    expect(names).toContain("deepseek_v3");
    expect(names).toContain("qwen");
    expect(names).toContain("llama");
    expect(names).toContain("mistral");
    expect(names).toContain("glm45");
    expect(names.length).toBeGreaterThanOrEqual(8);
  });

  it("retrieves a parser by name", () => {
    const parser = getParser("hermes");
    expect(parser).not.toBeNull();
    expect(parser!.name).toBe("hermes");
  });

  it("returns null for unknown parser", () => {
    expect(getParser("nonexistent")).toBeNull();
  });
});

describe("hermes parser", () => {
  const parser = getParser("hermes")!;

  it("extracts a single tool call", () => {
    const text = 'Thinking...\n<tool_call>{"name":"write_file","arguments":{"path":"a.txt","content":"hi"}}</tool_call>';
    const result = parser.parse(text);
    expect(result.toolCalls).not.toBeNull();
    expect(result.toolCalls!).toHaveLength(1);
    expect(result.toolCalls![0].function.name).toBe("write_file");
    expect(result.content).toBe("Thinking...");
  });

  it("extracts multiple tool calls", () => {
    const text = '<tool_call>{"name":"a","arguments":{}}</tool_call> <tool_call>{"name":"b","arguments":{}}</tool_call>';
    const result = parser.parse(text);
    expect(result.toolCalls).toHaveLength(2);
  });

  it("returns content only when no tool calls", () => {
    const result = parser.parse("Just some text without tool calls.");
    expect(result.toolCalls).toBeNull();
    expect(result.content).toBe("Just some text without tool calls.");
  });
});

describe("deepseek_v3 parser", () => {
  const parser = getParser("deepseek_v3")!;

  it("extracts tool call from DeepSeek format", () => {
    const text = "Let me search.\n<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>function<｜tool▁sep｜>web_search\n```json\n{\"query\":\"test\"}\n```\n<｜tool▁call▁end｜>";
    const result = parser.parse(text);
    expect(result.toolCalls).not.toBeNull();
    expect(result.toolCalls![0].function.name).toBe("web_search");
    expect(result.content).toBe("Let me search.");
  });

  it("returns content when no DeepSeek markers present", () => {
    const result = parser.parse("No tool calls here");
    expect(result.toolCalls).toBeNull();
  });
});

describe("qwen parser", () => {
  const parser = getParser("qwen")!;

  it("extracts Qwen-style function calls", () => {
    const text = "I will search.\n✿FUNCTION✿: web_search\n✿ARGS✿: {\"query\":\"hello\"}";
    const result = parser.parse(text);
    expect(result.toolCalls).not.toBeNull();
    expect(result.toolCalls![0].function.name).toBe("web_search");
    expect(result.content).toBe("I will search.");
  });
});

describe("llama parser", () => {
  const parser = getParser("llama")!;

  it("extracts Llama-style function calls", () => {
    const text = 'Let me check.<|python_tag|>{"name":"search","parameters":{"q":"test"}}';
    const result = parser.parse(text);
    expect(result.toolCalls).not.toBeNull();
    expect(result.toolCalls![0].function.name).toBe("search");
    expect(result.content).toBe("Let me check.");
  });
});

describe("mistral parser", () => {
  const parser = getParser("mistral")!;

  it("extracts Mistral-style tool calls", () => {
    const text = 'Here is my answer.\n[TOOL_CALLS][{"name":"calc","arguments":{"expr":"2+2"}}]';
    const result = parser.parse(text);
    expect(result.toolCalls).not.toBeNull();
    expect(result.toolCalls![0].function.name).toBe("calc");
    expect(result.content).toBe("Here is my answer.");
  });

  it("handles malformed JSON gracefully", () => {
    const text = "Some text\n[TOOL_CALLS]not-json";
    const result = parser.parse(text);
    expect(result.toolCalls).toBeNull();
  });
});
