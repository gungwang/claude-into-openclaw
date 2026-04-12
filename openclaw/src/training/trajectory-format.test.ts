import { describe, expect, it } from "vitest";
import {
  messagesToTrajectoryTurns,
  extractToolStats,
  extractReasoningStats,
  filterBadTrajectories,
  validateTrajectoryRecord,
  type TrajectoryRecord,
  type TrajectoryTurn,
} from "./trajectory-format.js";

const sampleTurns: TrajectoryTurn[] = [
  { from: "system", value: "You are a helpful assistant." },
  { from: "human", value: "Write a hello world in Python." },
  { from: "gpt", value: "```python\nprint('hello world')\n```" },
  { from: "human", value: "Now add a function." },
  { from: "gpt", value: '<tool_call>{"name":"write_file","arguments":{"path":"main.py","content":"def hello():\\n    print(\'hello\')"}}</tool_call>' },
  { from: "tool", value: '{"success":true}' },
  { from: "gpt", value: "Done! I've created the function." },
];

describe("messagesToTrajectoryTurns", () => {
  it("converts standard message array to turns", () => {
    const messages = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
    ];
    const turns = messagesToTrajectoryTurns(messages);
    expect(turns).toHaveLength(3);
    expect(turns[0].from).toBe("system");
    expect(turns[1].from).toBe("human");
    expect(turns[2].from).toBe("gpt");
  });
});

describe("extractToolStats", () => {
  it("counts tool calls from turns", () => {
    const stats = extractToolStats(sampleTurns);
    expect(stats.totalToolCalls).toBeGreaterThan(0);
    expect(typeof stats.uniqueTools).toBe("number");
  });
});

describe("extractReasoningStats", () => {
  it("computes stats from turns", () => {
    const stats = extractReasoningStats(sampleTurns);
    expect(stats).toHaveProperty("totalTurns");
    expect(stats).toHaveProperty("assistantTurns");
    expect(stats.totalTurns).toBe(sampleTurns.length);
  });
});

describe("filterBadTrajectories", () => {
  function makeRecord(turns: TrajectoryTurn[], overrides?: Partial<TrajectoryRecord>): TrajectoryRecord {
    return {
      id: "test-1",
      prompt: "test prompt",
      conversations: [{ turns }],
      model: "test-model",
      ...overrides,
    };
  }

  it("keeps valid trajectories", () => {
    const records = [makeRecord(sampleTurns)];
    const filtered = filterBadTrajectories(records);
    expect(filtered).toHaveLength(1);
  });

  it("filters out empty trajectories", () => {
    const records = [makeRecord([])];
    const filtered = filterBadTrajectories(records);
    expect(filtered).toHaveLength(0);
  });

  it("filters out single-turn trajectories", () => {
    const records = [makeRecord([{ from: "human", value: "hi" }])];
    const filtered = filterBadTrajectories(records);
    expect(filtered).toHaveLength(0);
  });
});

describe("validateTrajectoryRecord", () => {
  it("accepts valid records", () => {
    const record: TrajectoryRecord = {
      id: "r1",
      prompt: "test",
      conversations: [{ turns: sampleTurns }],
      model: "gpt-4",
    };
    expect(validateTrajectoryRecord(record)).toBe(true);
  });

  it("rejects record without id", () => {
    const record = {
      prompt: "test",
      conversations: [{ turns: sampleTurns }],
      model: "gpt-4",
    } as any;
    expect(validateTrajectoryRecord(record)).toBe(false);
  });

  it("rejects record without conversations", () => {
    const record = {
      id: "r1",
      prompt: "test",
      model: "gpt-4",
    } as any;
    expect(validateTrajectoryRecord(record)).toBe(false);
  });
});
