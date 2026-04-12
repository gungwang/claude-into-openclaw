/**
 * Mixture of Agents (MoA) Tool (Track E — Advanced Tools)
 *
 * Multi-model consensus via parallel delegation to different LLMs,
 * followed by synthesis. Improves answer quality for complex questions
 * by combining diverse model perspectives.
 *
 * Based on: "Mixture-of-Agents Enhances Large Language Model Capabilities"
 * (Wang et al., arXiv:2406.04692v1).
 *
 * Ported from hermes-agent `tools/mixture_of_agents_tool.py`.
 * Adapted to TypeScript with async parallel execution.
 */

// ── Types ──

export type MoaModel = {
  /** Model identifier (e.g., "anthropic/claude-sonnet-4-20250514"). */
  id: string;
  /** Provider name for routing. */
  provider: string;
  /** Display name. */
  name: string;
};

export type MoaConfig = {
  /** Enable MoA tool. Default: false (opt-in). */
  enabled: boolean;
  /** Reference models that generate diverse initial responses. */
  referenceModels: readonly MoaModel[];
  /** Aggregator model that synthesizes responses. */
  aggregatorModel: MoaModel;
  /** Reference model temperature (higher = more diverse). Default: 0.6. */
  referenceTemperature: number;
  /** Aggregator temperature (lower = more focused). Default: 0.4. */
  aggregatorTemperature: number;
  /** Minimum successful reference responses needed. Default: 1. */
  minSuccessfulReferences: number;
  /** Max tokens per reference response. Default: 32_000. */
  maxReferenceTokens: number;
  /** Max tokens for aggregated response. Default: 32_000. */
  maxAggregatorTokens: number;
  /** Timeout per reference model (ms). Default: 120_000. */
  referenceTimeoutMs: number;
};

export const DEFAULT_MOA_CONFIG: MoaConfig = {
  enabled: false,
  referenceModels: [
    { id: "claude-sonnet-4-20250514", provider: "anthropic", name: "Claude Sonnet" },
    { id: "gpt-4o", provider: "openai", name: "GPT-4o" },
    { id: "gemini-2.5-pro", provider: "google", name: "Gemini Pro" },
    { id: "deepseek-chat", provider: "deepseek", name: "DeepSeek V3" },
  ],
  aggregatorModel: {
    id: "claude-sonnet-4-20250514",
    provider: "anthropic",
    name: "Claude Sonnet (Aggregator)",
  },
  referenceTemperature: 0.6,
  aggregatorTemperature: 0.4,
  minSuccessfulReferences: 1,
  maxReferenceTokens: 32_000,
  maxAggregatorTokens: 32_000,
  referenceTimeoutMs: 120_000,
};

export type ReferenceResult = {
  model: MoaModel;
  content: string;
  ok: boolean;
  error?: string;
  durationMs: number;
};

export type MoaResult = {
  /** Final synthesized response. */
  content: string;
  /** Individual reference model results. */
  references: readonly ReferenceResult[];
  /** Total time for the full MoA pipeline. */
  totalDurationMs: number;
  /** Number of successful reference models. */
  successfulReferences: number;
  /** Whether the result was successfully aggregated. */
  aggregated: boolean;
};

// ── LLM caller interface ──

/**
 * Injectable LLM call function.
 * Implementations route to the appropriate provider.
 */
export type LlmCaller = (params: {
  model: string;
  provider: string;
  messages: readonly { role: string; content: string }[];
  temperature: number;
  maxTokens: number;
}) => Promise<{ content: string }>;

// ── Aggregator system prompt ──

const AGGREGATOR_SYSTEM_PROMPT = `You have been provided with a set of responses from various AI models to the latest user query. Your task is to synthesize these responses into a single, high-quality response. It is crucial to critically evaluate the information provided in these responses, recognizing that some of it may be biased or incorrect. Your response should not simply replicate the given answers but should offer a refined, accurate, and comprehensive reply to the instruction. Ensure your response is well-structured, coherent, and adheres to the highest standards of accuracy and reliability.

Responses from models:`;

// ── MoA execution ──

/**
 * Execute a Mixture of Agents query.
 *
 * 1. Send the user prompt to all reference models in parallel.
 * 2. Collect responses (with timeout + fault tolerance).
 * 3. Send all successful responses to the aggregator for synthesis.
 */
export async function executeMoaQuery(
  userPrompt: string,
  llmCaller: LlmCaller,
  config: MoaConfig = DEFAULT_MOA_CONFIG,
): Promise<MoaResult> {
  const start = performance.now();

  // Phase 1: Parallel reference model calls
  const referencePromises = config.referenceModels.map((model) =>
    callReferenceModel(model, userPrompt, llmCaller, config),
  );

  const references = await Promise.all(referencePromises);
  const successful = references.filter((r) => r.ok);

  if (successful.length < config.minSuccessfulReferences) {
    return {
      content: `MoA failed: only ${successful.length}/${config.minSuccessfulReferences} reference models responded successfully.`,
      references,
      totalDurationMs: performance.now() - start,
      successfulReferences: successful.length,
      aggregated: false,
    };
  }

  // Phase 2: Aggregation
  const aggregatorPrompt = constructAggregatorPrompt(
    AGGREGATOR_SYSTEM_PROMPT,
    successful.map((r) => `[${r.model.name}]: ${r.content}`),
  );

  try {
    const aggregated = await llmCaller({
      model: config.aggregatorModel.id,
      provider: config.aggregatorModel.provider,
      messages: [
        { role: "system", content: aggregatorPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: config.aggregatorTemperature,
      maxTokens: config.maxAggregatorTokens,
    });

    return {
      content: aggregated.content,
      references,
      totalDurationMs: performance.now() - start,
      successfulReferences: successful.length,
      aggregated: true,
    };
  } catch (err) {
    // Fallback: return best single reference response
    const best = successful.reduce((a, b) =>
      a.content.length > b.content.length ? a : b,
    );

    return {
      content: `[Aggregation failed, returning best single response from ${best.model.name}]\n\n${best.content}`,
      references,
      totalDurationMs: performance.now() - start,
      successfulReferences: successful.length,
      aggregated: false,
    };
  }
}

// ── Helpers ──

async function callReferenceModel(
  model: MoaModel,
  userPrompt: string,
  llmCaller: LlmCaller,
  config: MoaConfig,
): Promise<ReferenceResult> {
  const start = performance.now();

  try {
    const result = await Promise.race([
      llmCaller({
        model: model.id,
        provider: model.provider,
        messages: [{ role: "user", content: userPrompt }],
        temperature: config.referenceTemperature,
        maxTokens: config.maxReferenceTokens,
      }),
      rejectAfter(config.referenceTimeoutMs, model.name),
    ]);

    return {
      model,
      content: result.content,
      ok: true,
      durationMs: performance.now() - start,
    };
  } catch (err) {
    return {
      model,
      content: "",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: performance.now() - start,
    };
  }
}

function constructAggregatorPrompt(
  systemPrompt: string,
  responses: readonly string[],
): string {
  const responseText = responses
    .map((r, i) => `${i + 1}. ${r}`)
    .join("\n\n");
  return `${systemPrompt}\n\n${responseText}`;
}

function rejectAfter(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
}

// ── Tool definition ──

export function getMoaToolDefinition(): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return {
    name: "mixture_of_agents",
    description:
      "Process an extremely difficult question using multiple AI models in parallel, then synthesize their responses into a single high-quality answer. Use for complex reasoning, coding, or analytical tasks where diverse perspectives improve quality.",
    parameters: {
      type: "object",
      properties: {
        user_prompt: {
          type: "string",
          description: "The complex question or task to process.",
        },
      },
      required: ["user_prompt"],
    },
  };
}
