/**
 * Configuration types for Track C — Developer Experience modules.
 *
 * Covers: git worktree isolation, prompt caching, context references,
 * budget tracking, and checkpoint management.
 */

import type { WorktreeConfig } from "../agents/git-worktree.js";
import type { PromptCachingConfig } from "../agents/prompt-caching.js";
import type { ContextReferencesConfig } from "../agents/context-references.js";
import type { BudgetConfig } from "../agents/budget-tracker.js";
import type { CheckpointConfig } from "../tools/checkpoint-manager.js";

export type DeveloperExperienceConfig = {
  /** Git worktree isolation for concurrent editing sessions. */
  worktree?: Partial<WorktreeConfig>;
  /** Provider-specific prompt caching optimization. */
  promptCaching?: Partial<PromptCachingConfig>;
  /** Automatic @-reference expansion in user messages. */
  contextReferences?: Partial<ContextReferencesConfig>;
  /** Per-tool and per-session cost budget limits. */
  budget?: Partial<BudgetConfig>;
  /** Git-based filesystem checkpoint and rollback. */
  checkpoints?: Partial<CheckpointConfig>;
};
