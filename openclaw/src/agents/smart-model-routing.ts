/**
 * Smart Model Routing — Task→Model Selection (Track A — Session Intelligence)
 *
 * Routes tasks to the most appropriate model based on task complexity,
 * cost targets, and available model capabilities. Simple tasks go to
 * cheaper/faster models; complex tasks go to more capable models.
 *
 * Ported from hermes-agent `agent/smart_model_routing.py`.
 */

// ── Task complexity ──

export type TaskComplexity = "trivial" | "simple" | "moderate" | "complex" | "expert";

// ── Model tier ──

export type ModelTier = "fast" | "standard" | "capable" | "premium";

// ── Model capability descriptor ──

export type ModelCapability = {
  modelId: string;
  provider: string;
  tier: ModelTier;
  contextWindow: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
  maxOutputTokens?: number;
};

// ── Routing decision ──

export type RoutingDecision = {
  selectedModel: string;
  selectedProvider: string;
  tier: ModelTier;
  reason: string;
  complexityScore: TaskComplexity;
  estimatedCost: number;
  alternatives: Array<{ modelId: string; reason: string }>;
};

// ── Complexity signals ──

type ComplexitySignal = {
  label: string;
  weight: number;
  test: (context: TaskContext) => boolean;
};

const COMPLEXITY_SIGNALS: ComplexitySignal[] = [
  {
    label: "multi-file edit",
    weight: 2,
    test: (ctx) => ctx.fileCount > 3,
  },
  {
    label: "large codebase context",
    weight: 1,
    test: (ctx) => ctx.contextTokens > 8000,
  },
  {
    label: "architecture/design task",
    weight: 3,
    test: (ctx) =>
      /\b(architect|design|refactor|migrate|upgrade)\b/i.test(ctx.taskDescription),
  },
  {
    label: "debugging/diagnosis",
    weight: 2,
    test: (ctx) =>
      /\b(debug|diagnos|investigate|root cause|stack trace)\b/i.test(
        ctx.taskDescription,
      ),
  },
  {
    label: "simple query",
    weight: -2,
    test: (ctx) =>
      /\b(what is|how to|explain|list|show|describe)\b/i.test(
        ctx.taskDescription,
      ) && ctx.contextTokens < 2000,
  },
  {
    label: "code generation",
    weight: 1,
    test: (ctx) =>
      /\b(create|generate|implement|write|build|add)\b/i.test(
        ctx.taskDescription,
      ),
  },
  {
    label: "tool-heavy workflow",
    weight: 1,
    test: (ctx) => ctx.expectedToolCalls > 3,
  },
  {
    label: "reasoning required",
    weight: 2,
    test: (ctx) =>
      /\b(reason|analyze|compare|evaluate|trade-?off|pros and cons)\b/i.test(
        ctx.taskDescription,
      ),
  },
  {
    label: "vision task",
    weight: 1,
    test: (ctx) => ctx.hasImages,
  },
  {
    label: "trivial command",
    weight: -3,
    test: (ctx) =>
      /^(yes|no|ok|done|continue|go|next|skip)\s*$/i.test(
        ctx.taskDescription.trim(),
      ),
  },
];

// ── Task context ──

export type TaskContext = {
  taskDescription: string;
  contextTokens: number;
  fileCount: number;
  expectedToolCalls: number;
  hasImages: boolean;
  conversationTurns: number;
  previousErrors: number;
};

// ── Complexity scoring ──

function scoreComplexity(context: TaskContext): {
  score: number;
  signals: string[];
} {
  let score = 0;
  const signals: string[] = [];
  for (const signal of COMPLEXITY_SIGNALS) {
    if (signal.test(context)) {
      score += signal.weight;
      signals.push(signal.label);
    }
  }
  // Factor in conversation depth
  if (context.conversationTurns > 20) {
    score += 1;
    signals.push("long conversation");
  }
  // Factor in previous errors (suggests harder task)
  if (context.previousErrors > 2) {
    score += 1;
    signals.push("repeated errors");
  }
  return { score, signals };
}

function complexityFromScore(score: number): TaskComplexity {
  if (score <= -2) return "trivial";
  if (score <= 0) return "simple";
  if (score <= 2) return "moderate";
  if (score <= 4) return "complex";
  return "expert";
}

// ── Tier mapping ──

const COMPLEXITY_TO_TIER: Record<TaskComplexity, ModelTier> = {
  trivial: "fast",
  simple: "fast",
  moderate: "standard",
  complex: "capable",
  expert: "premium",
};

// ── Router ──

export type SmartModelRouterConfig = {
  /** Available model capabilities (pre-sorted by preference). */
  models: ModelCapability[];
  /** Override: always use this model regardless of routing. */
  forceModel?: string;
  /** Budget limit per request (USD). 0 = no limit. */
  maxCostPerRequest?: number;
  /** Require tool support for tool-using tasks. */
  requireToolSupport?: boolean;
};

/**
 * Select the best model for a given task context.
 */
export function routeTask(
  context: TaskContext,
  config: SmartModelRouterConfig,
): RoutingDecision {
  // Force model override
  if (config.forceModel) {
    const forced = config.models.find(
      (m) => m.modelId === config.forceModel,
    );
    return {
      selectedModel: config.forceModel,
      selectedProvider: forced?.provider ?? "unknown",
      tier: forced?.tier ?? "standard",
      reason: "forced model override",
      complexityScore: "moderate",
      estimatedCost: 0,
      alternatives: [],
    };
  }

  const { score, signals } = scoreComplexity(context);
  const complexity = complexityFromScore(score);
  const targetTier = COMPLEXITY_TO_TIER[complexity];

  // Filter eligible models
  let eligible = config.models.filter((m) => {
    // Context window must fit
    if (m.contextWindow < context.contextTokens) return false;
    // Vision requirement
    if (context.hasImages && !m.supportsVision) return false;
    // Tool support requirement
    if (
      config.requireToolSupport !== false &&
      context.expectedToolCalls > 0 &&
      !m.supportsTools
    ) {
      return false;
    }
    return true;
  });

  // Apply budget filter
  if (config.maxCostPerRequest && config.maxCostPerRequest > 0) {
    const budgetFiltered = eligible.filter((m) => {
      const est =
        (context.contextTokens / 1000) * m.costPer1kInput +
        (2000 / 1000) * m.costPer1kOutput;
      return est <= config.maxCostPerRequest!;
    });
    if (budgetFiltered.length > 0) eligible = budgetFiltered;
  }

  if (eligible.length === 0) {
    // Fallback to first available model
    const fallback = config.models[0];
    return {
      selectedModel: fallback?.modelId ?? "unknown",
      selectedProvider: fallback?.provider ?? "unknown",
      tier: fallback?.tier ?? "standard",
      reason: "no eligible model found, using fallback",
      complexityScore: complexity,
      estimatedCost: 0,
      alternatives: [],
    };
  }

  // Find models at the target tier
  const tierOrder: ModelTier[] = ["fast", "standard", "capable", "premium"];
  const targetTierIdx = tierOrder.indexOf(targetTier);

  // Try target tier first, then adjacent tiers
  let selected: ModelCapability | undefined;
  for (
    let offset = 0;
    offset < tierOrder.length && !selected;
    offset++
  ) {
    for (const dir of [0, 1, -1]) {
      const idx = targetTierIdx + (dir === 0 ? 0 : dir * offset);
      if (idx < 0 || idx >= tierOrder.length) continue;
      const tier = tierOrder[idx];
      selected = eligible.find((m) => m.tier === tier);
      if (selected) break;
    }
  }

  if (!selected) selected = eligible[0];

  const estimatedCost =
    (context.contextTokens / 1000) * selected.costPer1kInput +
    (2000 / 1000) * selected.costPer1kOutput;

  const alternatives = eligible
    .filter((m) => m.modelId !== selected!.modelId)
    .slice(0, 3)
    .map((m) => ({
      modelId: m.modelId,
      reason: `tier=${m.tier} cost=$${((context.contextTokens / 1000) * m.costPer1kInput).toFixed(4)}`,
    }));

  return {
    selectedModel: selected.modelId,
    selectedProvider: selected.provider,
    tier: selected.tier,
    reason: `complexity=${complexity} (${signals.join(", ")}), target_tier=${targetTier}`,
    complexityScore: complexity,
    estimatedCost: Math.round(estimatedCost * 10000) / 10000,
    alternatives,
  };
}

// ── Formatting ──

export function formatRoutingDecision(decision: RoutingDecision): string {
  const lines = [
    `Model: ${decision.selectedModel} (${decision.selectedProvider})`,
    `Tier: ${decision.tier} | Complexity: ${decision.complexityScore}`,
    `Reason: ${decision.reason}`,
    `Est. cost: $${decision.estimatedCost.toFixed(4)}`,
  ];
  if (decision.alternatives.length > 0) {
    lines.push("Alternatives:");
    for (const alt of decision.alternatives) {
      lines.push(`  - ${alt.modelId}: ${alt.reason}`);
    }
  }
  return lines.join("\n");
}
