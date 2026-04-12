/**
 * Toolset Distributions — Stochastic toolset sampling (Track G — Training Pipeline)
 *
 * Defines distributions of toolsets for data generation runs.
 * Each distribution maps toolset names to independent Bernoulli inclusion probabilities.
 * When sampling, each toolset is included/excluded independently based on its probability.
 * Guaranteed non-empty fallback to highest-probability toolset.
 *
 * Ported from hermes-agent `toolset_distributions.py`.
 */

// ── Types ──

export type ToolsetDistribution = {
  /** Human-readable description of the distribution's purpose. */
  description: string;
  /** Map of toolset name → inclusion probability (0-100). */
  toolsets: Record<string, number>;
};

export type DistributionName = keyof typeof DISTRIBUTIONS;

// ── Built-in distributions (matching hermes-agent) ──

export const DISTRIBUTIONS = {
  default: {
    description: "All available tools, all the time",
    toolsets: {
      web: 100,
      vision: 100,
      image_gen: 100,
      terminal: 100,
      file: 100,
      moa: 100,
      browser: 100,
    },
  },
  image_gen: {
    description: "Heavy focus on image generation with vision and web support",
    toolsets: {
      image_gen: 90,
      vision: 90,
      web: 55,
      terminal: 45,
      moa: 10,
    },
  },
  research: {
    description: "Web research with vision analysis and reasoning",
    toolsets: {
      web: 90,
      browser: 70,
      vision: 50,
      moa: 40,
      terminal: 10,
    },
  },
  science: {
    description: "Scientific research with web, terminal, file, and browser",
    toolsets: {
      web: 94,
      terminal: 94,
      file: 94,
      vision: 65,
      browser: 50,
      image_gen: 15,
      moa: 10,
    },
  },
  development: {
    description: "Terminal, file tools, and reasoning with occasional web lookup",
    toolsets: {
      terminal: 80,
      file: 80,
      moa: 60,
      web: 30,
      vision: 10,
    },
  },
  safe: {
    description: "All tools except terminal for safety",
    toolsets: {
      web: 80,
      browser: 70,
      vision: 60,
      image_gen: 60,
      moa: 50,
    },
  },
  balanced: {
    description: "Equal probability of all toolsets",
    toolsets: {
      web: 50,
      vision: 50,
      image_gen: 50,
      terminal: 50,
      file: 50,
      moa: 50,
      browser: 50,
    },
  },
  minimal: {
    description: "Only web tools for basic research",
    toolsets: {
      web: 100,
    },
  },
  terminal_only: {
    description: "Terminal and file tools for code execution tasks",
    toolsets: {
      terminal: 100,
      file: 100,
    },
  },
  terminal_web: {
    description: "Terminal and file tools with web search for documentation",
    toolsets: {
      terminal: 100,
      file: 100,
      web: 100,
    },
  },
  creative: {
    description: "Image generation and vision analysis focus",
    toolsets: {
      image_gen: 90,
      vision: 90,
      web: 30,
    },
  },
  reasoning: {
    description: "Heavy mixture of agents usage with minimal other tools",
    toolsets: {
      moa: 90,
      web: 30,
      terminal: 20,
    },
  },
  browser_use: {
    description: "Full browser-based web interaction with search and vision",
    toolsets: {
      browser: 100,
      web: 80,
      vision: 70,
    },
  },
  browser_only: {
    description: "Only browser automation tools for pure web interaction",
    toolsets: {
      browser: 100,
    },
  },
  browser_tasks: {
    description: "Browser-focused distribution for browser-use tasks",
    toolsets: {
      browser: 97,
      vision: 12,
      terminal: 15,
    },
  },
  terminal_tasks: {
    description: "Terminal-focused with high terminal/file availability",
    toolsets: {
      terminal: 97,
      file: 97,
      web: 97,
      browser: 75,
      vision: 50,
      image_gen: 10,
    },
  },
  mixed_tasks: {
    description: "Mixed browser + terminal for complex tasks",
    toolsets: {
      browser: 92,
      terminal: 92,
      file: 92,
      web: 35,
      vision: 15,
      image_gen: 15,
    },
  },
} as const satisfies Record<string, ToolsetDistribution>;

// ── API ──

/**
 * Get a distribution by name, or return custom distribution if passed directly.
 */
export function getDistribution(name: string): ToolsetDistribution | null {
  return (DISTRIBUTIONS as Record<string, ToolsetDistribution>)[name] ?? null;
}

/**
 * List all available built-in distribution names.
 */
export function listDistributions(): readonly string[] {
  return Object.keys(DISTRIBUTIONS);
}

/**
 * Sample toolsets from a distribution using independent Bernoulli trials.
 *
 * Each toolset in the distribution has an independent probability (0-100)
 * of being included. If no toolsets are selected, the highest-probability
 * toolset is guaranteed as a fallback.
 *
 * @param distributionName - Built-in distribution name or custom distribution.
 * @param knownToolsets - Optional set of valid toolset names (skips unknown ones).
 * @returns Array of selected toolset names.
 */
export function sampleToolsetsFromDistribution(
  distributionName: string,
  knownToolsets?: ReadonlySet<string>,
): string[] {
  const dist = getDistribution(distributionName);
  if (!dist) throw new Error(`Unknown distribution: ${distributionName}`);

  return sampleFromDistribution(dist, knownToolsets);
}

/**
 * Sample from a distribution object directly (for custom distributions).
 */
export function sampleFromDistribution(
  dist: ToolsetDistribution,
  knownToolsets?: ReadonlySet<string>,
): string[] {
  const selected: string[] = [];

  for (const [toolset, probability] of Object.entries(dist.toolsets)) {
    if (knownToolsets && !knownToolsets.has(toolset)) continue;
    if (Math.random() * 100 < probability) {
      selected.push(toolset);
    }
  }

  // Guarantee at least one toolset — pick highest probability
  if (selected.length === 0) {
    let bestToolset = "";
    let bestProb = -1;

    for (const [toolset, probability] of Object.entries(dist.toolsets)) {
      if (knownToolsets && !knownToolsets.has(toolset)) continue;
      if (probability > bestProb) {
        bestProb = probability;
        bestToolset = toolset;
      }
    }

    if (bestToolset) selected.push(bestToolset);
  }

  return selected;
}

/**
 * Validate that all toolsets in a distribution exist in the known set.
 */
export function validateDistribution(
  dist: ToolsetDistribution,
  knownToolsets: ReadonlySet<string>,
): { valid: boolean; unknown: string[] } {
  const unknown: string[] = [];
  for (const toolset of Object.keys(dist.toolsets)) {
    if (!knownToolsets.has(toolset)) unknown.push(toolset);
  }
  return { valid: unknown.length === 0, unknown };
}

/**
 * Create a custom distribution from a toolset → probability map.
 */
export function createCustomDistribution(
  description: string,
  toolsets: Record<string, number>,
): ToolsetDistribution {
  // Clamp probabilities to [0, 100]
  const clamped: Record<string, number> = {};
  for (const [name, prob] of Object.entries(toolsets)) {
    clamped[name] = Math.max(0, Math.min(100, prob));
  }
  return { description, toolsets: clamped };
}
