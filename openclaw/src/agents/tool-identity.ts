export type ToolNamespace = "core" | "plugin" | "skill" | "provider" | "local";

export type ToolCapabilityClass =
  | "read"
  | "write"
  | "execute"
  | "network"
  | "messaging"
  | "scheduling"
  | "other";

export type CanonicalToolIdentity = {
  id: string;
  displayName: string;
  namespace: ToolNamespace;
  capabilityClass: ToolCapabilityClass;
  version?: string;
  sourceDigest?: string;
};

export type ToolIdentityIssueCode =
  | "missing_id"
  | "invalid_id"
  | "missing_display_name"
  | "invalid_namespace"
  | "invalid_capability_class";

export type ToolIdentityIssue = {
  code: ToolIdentityIssueCode;
  message: string;
  field?: keyof CanonicalToolIdentity;
};

export type DuplicateCanonicalId = {
  id: string;
  entries: CanonicalToolIdentity[];
};

export type AmbiguousDisplayName = {
  displayName: string;
  ids: string[];
  entries: CanonicalToolIdentity[];
};

const CANONICAL_ID_RE = /^[a-z0-9]+(?::[a-z0-9._-]+)+$/;

const VALID_NAMESPACES = new Set<ToolNamespace>(["core", "plugin", "skill", "provider", "local"]);

const VALID_CAPABILITY_CLASSES = new Set<ToolCapabilityClass>([
  "read",
  "write",
  "execute",
  "network",
  "messaging",
  "scheduling",
  "other",
]);

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeCanonicalToolId(id: string): string {
  const trimmed = id.trim().toLowerCase();
  const segments = trimmed
    .split(":")
    .map((segment) => normalizeToken(segment))
    .filter((segment) => segment.length > 0);
  return segments.join(":");
}

export function deriveFallbackCanonicalToolId(params: {
  namespace: ToolNamespace;
  toolName: string;
  pluginId?: string;
  providerId?: string;
}): string {
  const namespace = normalizeToken(params.namespace) || "local";
  const toolName = normalizeToken(params.toolName) || "tool";

  if (params.namespace === "plugin") {
    const pluginId = normalizeToken(params.pluginId ?? "unknown");
    return `plugin:${pluginId || "unknown"}:${toolName}`;
  }

  if (params.namespace === "provider") {
    const providerId = normalizeToken(params.providerId ?? "unknown");
    return `provider:${providerId || "unknown"}:${toolName}`;
  }

  return `${namespace}:${toolName}`;
}

export function inferCapabilityClassFromToolName(name: string): ToolCapabilityClass {
  const normalized = normalizeToken(name);
  const readTools = new Set(["read", "pdf", "memory_recall", "memory_get"]);
  const writeTools = new Set(["write", "edit", "apply_patch", "memory_store", "memory_update", "memory_forget"]);
  const executeTools = new Set(["exec", "process", "sessions_spawn", "subagents", "nodes"]);
  const networkTools = new Set(["web_search", "web_fetch", "gateway", "agents_list", "sessions_list", "sessions_history"]);
  const messagingTools = new Set(["message", "tts", "sessions_send"]);
  const schedulingTools = new Set(["cron", "sessions_yield"]);

  if (readTools.has(normalized)) {
    return "read";
  }
  if (writeTools.has(normalized)) {
    return "write";
  }
  if (executeTools.has(normalized)) {
    return "execute";
  }
  if (networkTools.has(normalized)) {
    return "network";
  }
  if (messagingTools.has(normalized)) {
    return "messaging";
  }
  if (schedulingTools.has(normalized)) {
    return "scheduling";
  }
  return "other";
}

export function validateCanonicalToolIdentity(
  identity: Partial<CanonicalToolIdentity>,
): ToolIdentityIssue[] {
  const issues: ToolIdentityIssue[] = [];

  const id = typeof identity.id === "string" ? normalizeCanonicalToolId(identity.id) : "";
  if (!id) {
    issues.push({
      code: "missing_id",
      field: "id",
      message: "Canonical tool identity requires a non-empty id.",
    });
  } else if (!CANONICAL_ID_RE.test(id)) {
    issues.push({
      code: "invalid_id",
      field: "id",
      message: "Canonical tool id must be namespaced and contain only lowercase letters, digits, ., _, -, and :.",
    });
  }

  if (!identity.displayName?.trim()) {
    issues.push({
      code: "missing_display_name",
      field: "displayName",
      message: "Canonical tool identity requires a displayName.",
    });
  }

  if (!identity.namespace || !VALID_NAMESPACES.has(identity.namespace)) {
    issues.push({
      code: "invalid_namespace",
      field: "namespace",
      message: "Canonical tool identity namespace is invalid.",
    });
  }

  if (!identity.capabilityClass || !VALID_CAPABILITY_CLASSES.has(identity.capabilityClass)) {
    issues.push({
      code: "invalid_capability_class",
      field: "capabilityClass",
      message: "Canonical tool identity capabilityClass is invalid.",
    });
  }

  return issues;
}

export function findDuplicateCanonicalIds(
  identities: CanonicalToolIdentity[],
): DuplicateCanonicalId[] {
  const grouped = new Map<string, CanonicalToolIdentity[]>();
  for (const identity of identities) {
    const id = normalizeCanonicalToolId(identity.id);
    const list = grouped.get(id) ?? [];
    list.push(identity);
    grouped.set(id, list);
  }
  return Array.from(grouped.entries())
    .filter(([, entries]) => entries.length > 1)
    .map(([id, entries]) => ({ id, entries }))
    .toSorted((a, b) => a.id.localeCompare(b.id));
}

export function findAmbiguousDisplayNames(
  identities: CanonicalToolIdentity[],
): AmbiguousDisplayName[] {
  const grouped = new Map<string, CanonicalToolIdentity[]>();
  for (const identity of identities) {
    const key = identity.displayName.trim().toLowerCase();
    if (!key) {
      continue;
    }
    const list = grouped.get(key) ?? [];
    list.push(identity);
    grouped.set(key, list);
  }

  return Array.from(grouped.values())
    .map((entries) => {
      const ids = Array.from(new Set(entries.map((entry) => normalizeCanonicalToolId(entry.id))));
      if (ids.length <= 1) {
        return null;
      }
      return {
        displayName: entries[0]!.displayName,
        ids: ids.toSorted((a, b) => a.localeCompare(b)),
        entries,
      } satisfies AmbiguousDisplayName;
    })
    .filter((entry): entry is AmbiguousDisplayName => entry !== null)
    .toSorted((a, b) => a.displayName.localeCompare(b.displayName));
}
