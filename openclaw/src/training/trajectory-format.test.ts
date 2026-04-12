import { describe, expect, it } from "vitest";
import {
  messagesToTrajectoryTurns,
  extractToolStats,
  extractToolErrorCounts,
  extractReasoningStats,
  filterBadTrajectories,
  validateTrajectoryRecord,
  mapRole,
  serializeTrajectoryRecord,
  deserializeTrajectoryRecord,
  type TrajectoryRecord,
  type TrajectoryTurn,
} from "./trajectory-format.js";

const sampleTurns: TrajectoryTurn[] = [
  { from: "system", value: "You are a helpful assistant." },
  { from: "human", value: "Write a hello world in Python." },
  { from: "gpt", value: "```python\nprint('hello world')\n```" },
  { from: "human", value: "Now add a function." },
  {
    from: "gpt",
    value: "",
    tool_calls: [
      {
        id: "call_1",
        type: "function",
        function: {
          name: "write_file",
          arguments: '{"path":"main.py","content":"def hello():\\n    print(\'hello\')"}',
        },
      },
    ],
  },
  { from: "tool", value: '{"success":true}', tool_call_id: "call_1" },
  { from: "gpt", value: "Done! I've created the function." },
];

function makeRecord(
  conversations: TrajectoryTurn[],
  overrides?: Partial<TrajectoryRecord>,
): TrajectoryRecord {
  return {
    id: "test-1",
    prompt: "test prompt",
    conversations,
    model: "test-model",
    toolsets: ["default"],
    toolStats: {},
    toolErrorCounts: {},
    reasoningStats: {
      totalAssistantTurns: 0,
      turnsWithReasoning: 0,
      turnsWithoutReasoning: 0,
      hasAnyReasoning: false,
    },
    timestamp: new Date().toISOString(),
    durationMs: 100,
    ...overrides,
  };
}

describe("mapRole", () => {
  it("maps OpenAI roles to Hermes roles", () => {
    expect(mapRole("system")).toBe("system");
    expect(mapRole("user")).toBe("human");
    expect(mapRole("assistant")).toBe("gpt");
    expect(mapRole("tool")).toBe("tool");
  });

  it("defaults unknown roles to human", () => {
    expect(mapRole("unknown")).toBe("human");
  });
});

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

  it("preserves tool_calls and tool_call_id", () => {
    const messages = [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "tc1", type: "function" as const, function: { name: "read_file", arguments: '{"path":"a.txt"}' } },
        ],
      },
      { role: "tool", content: "file contents", tool_call_id: "tc1" },
    ];
    const turns = messagesToTrajectoryTurns(messages);
    expect(turns[0].tool_calls).toHaveLength(1);
    expect(turns[0].tool_calls![0].function.name).toBe("read_file");
    expect(turns[1].tool_call_id).toBe("tc1");
  });

  it("preserves reasoning field", () => {
    const messages = [
      { role: "assistant", content: "answer", reasoning: "thinking..." },
    ];
    const turns = messagesToTrajectoryTurns(messages);
    expect(turns[0].reasoning).toBe("thinking...");
  });

  it("defaults null content to empty string", () => {
    const messages = [{ role: "assistant", content: null }];
    const turns = messagesToTrajectoryTurns(messages);
    expect(turns[0].value).toBe("");
  });
});

describe("extractToolStats", () => {
  it("counts tool calls from turns", () => {
    const stats = extractToolStats(sampleTurns);
    expect(stats["write_file"]).toBeDefined();
    expect(stats["write_file"].count).toBe(1);
    expect(stats["write_file"].success).toBe(1);
    expect(stats["write_file"].failure).toBe(0);
  });

  it("returns empty stats when there are no tool calls", () => {
    const turns: TrajectoryTurn[] = [
      { from: "human", value: "hi" },
      { from: "gpt", value: "hello" },
    ];
    const stats = extractToolStats(turns);
    expect(Object.keys(stats)).toHaveLength(0);
  });

  it("tracks failures from error responses", () => {
    const turns: TrajectoryTurn[] = [
      {
        from: "gpt",
        value: "",
        tool_calls: [
          { id: "c1", type: "function", function: { name: "run_cmd", arguments: "{}" } },
        ],
      },
      { from: "tool", value: '{"error":"command not found"}', tool_call_id: "c1" },
    ];
    const stats = extractToolStats(turns);
    expect(stats["run_cmd"].failure).toBe(1);
    expect(stats["run_cmd"].success).toBe(0);
  });
});

describe("extractToolErrorCounts", () => {
  it("returns per-tool failure counts", () => {
    const counts = extractToolErrorCounts(sampleTurns);
    expect(counts["write_file"]).toBe(0);
  });
});

describe("extractReasoningStats", () => {
  it("computes stats from turns without reasoning", () => {
    const stats = extractReasoningStats(sampleTurns);
    expect(stats.totalAssistantTurns).toBe(3); // 3 gpt turns
    expect(stats.turnsWithReasoning).toBe(0);
    expect(stats.turnsWithoutReasoning).toBe(3);
    expect(stats.hasAnyReasoning).toBe(false);
  });

  it("detects native reasoning", () => {
    const turns: TrajectoryTurn[] = [
      { from: "gpt", value: "answer", reasoning: "let me think" },
    ];
    const stats = extractReasoningStats(turns);
    expect(stats.totalAssistantTurns).toBe(1);
    expect(stats.turnsWithReasoning).toBe(1);
    expect(stats.hasAnyReasoning).toBe(true);
  });

  it("detects scratchpad reasoning", () => {
    const turns: TrajectoryTurn[] = [
      { from: "gpt", value: "<REASONING_SCRATCHPAD>thinking</REASONING_SCRATCHPAD>answer" },
    ];
    const stats = extractReasoningStats(turns);
    expect(stats.turnsWithReasoning).toBe(1);
    expect(stats.hasAnyReasoning).toBe(true);
  });
});

describe("serializeTrajectoryRecord / deserializeTrajectoryRecord", () => {
  it("round-trips a record through JSON", () => {
    const record = makeRecord(sampleTurns);
    const json = serializeTrajectoryRecord(record);
    const parsed = deserializeTrajectoryRecord(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe(record.id);
    expect(parsed!.conversations).toHaveLength(sampleTurns.length);
  });

  it("returns null for invalid JSON", () => {
    expect(deserializeTrajectoryRecord("not json")).toBeNull();
  });
});

describe("filterBadTrajectories", () => {
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

  it("filters out single-turn trajectories (below default minTurns=2)", () => {
    const records = [makeRecord([{ from: "human", value: "hi" }])];
    const filtered = filterBadTrajectories(records);
    expect(filtered).toHaveLength(0);
  });

  it("filters by known tool names when provided", () => {
    const records = [makeRecord(sampleTurns)];
    const filtered = filterBadTrajectories(records, {
      knownToolNames: new Set(["read_file"]), // write_file not in known set
    });
    expect(filtered).toHaveLength(0);
  });

  it("passes when all tool names are known", () => {
    const records = [makeRecord(sampleTurns)];
    const filtered = filterBadTrajectories(records, {
      knownToolNames: new Set(["write_file"]),
    });
    expect(filtered).toHaveLength(1);
  });
});

describe("validateTrajectoryRecord", () => {
  it("returns no issues for valid records", () => {
    const record = makeRecord(sampleTurns, { model: "gpt-4" });
    const issues = validateTrajectoryRecord(record);
    expect(issues).toHaveLength(0);
  });

  it("reports missing id", () => {
    const record = makeRecord(sampleTurns, { id: "" });
    const issues = validateTrajectoryRecord(record);
    expect(issues.some((i) => i.includes("ID") || i.includes("id"))).toBe(true);
  });

  it("reports missing conversations", () => {
    const record = makeRecord([], { conversations: [] as any });
    const issues = validateTrajectoryRecord(record);
    expect(issues.some((i) => i.includes("conversations") || i.includes("Empty"))).toBe(true);
  });

  it("reports missing timestamp", () => {
    const record = makeRecord(sampleTurns, { timestamp: "" });
    const issues = validateTrajectoryRecord(record);
    expect(issues.some((i) => i.includes("timestamp"))).toBe(true);
  });
});
