/**
 * Session Persistence — SQLite Backend (Track A — Session Intelligence)
 *
 * Persistent session storage with WAL mode and FTS5 full-text search.
 * Replaces in-memory-only journal with durable storage that survives
 * process restarts and supports cross-session search.
 *
 * Ported from hermes-agent `hermes_state.py` (SessionDB).
 * Adapted to TypeScript with synchronous `better-sqlite3` API.
 *
 * ── Dependencies ──
 * Requires `better-sqlite3` (synchronous, WAL-compatible).
 * The existing `sqlite-vec` dependency implies this is available.
 */

import path from "node:path";
import fs from "node:fs";

// ── Schema version ──

export const SCHEMA_VERSION = 1;

// ── Types ──

export type SessionRecord = {
  id: string;
  source: string;
  userId?: string;
  agentId?: string;
  model?: string;
  parentSessionId?: string;
  startedAt: number;
  endedAt?: number;
  endReason?: string;
  messageCount: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd?: number;
  title?: string;
};

export type MessageRecord = {
  id?: number;
  sessionId: string;
  role: string;
  content?: string;
  toolCallId?: string;
  toolCalls?: string;
  toolName?: string;
  timestamp: number;
  tokenCount?: number;
  finishReason?: string;
  reasoning?: string;
};

export type SessionSearchResult = {
  sessionId: string;
  messageId: number;
  role: string;
  content: string;
  timestamp: number;
  rank: number;
};

export type SessionPersistenceConfig = {
  dbPath: string;
  walMode?: boolean;
};

// ── SQL Statements ──

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  user_id TEXT,
  agent_id TEXT,
  model TEXT,
  parent_session_id TEXT,
  started_at REAL NOT NULL,
  ended_at REAL,
  end_reason TEXT,
  message_count INTEGER DEFAULT 0,
  tool_call_count INTEGER DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_write_tokens INTEGER DEFAULT 0,
  estimated_cost_usd REAL,
  title TEXT,
  FOREIGN KEY (parent_session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,
  content TEXT,
  tool_call_id TEXT,
  tool_calls TEXT,
  tool_name TEXT,
  timestamp REAL NOT NULL,
  token_count INTEGER,
  finish_reason TEXT,
  reasoning TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);
`;

const FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  content=messages,
  content_rowid=id
);

CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;
`;

// ── Write-contention config ──

const WRITE_MAX_RETRIES = 10;
const WRITE_RETRY_MIN_MS = 20;
const WRITE_RETRY_MAX_MS = 150;

// ── Database wrapper ──

/**
 * Minimal interface for better-sqlite3 Database used by this module.
 * Keeps the module testable without a hard dependency.
 */
export type SqliteDatabase = {
  pragma(source: string): unknown;
  exec(source: string): void;
  prepare(source: string): SqliteStatement;
  close(): void;
};

export type SqliteStatement = {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Record<string, unknown>[];
};

/**
 * Open (or create) the session persistence database.
 *
 * Usage with better-sqlite3:
 * ```ts
 * import Database from "better-sqlite3";
 * const db = openSessionDatabase({
 *   dbPath: "/path/to/sessions.db",
 * }, (dbPath) => new Database(dbPath));
 * ```
 */
export function openSessionDatabase(
  config: SessionPersistenceConfig,
  factory: (dbPath: string) => SqliteDatabase,
): SessionPersistenceStore {
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = factory(config.dbPath);
  if (config.walMode !== false) {
    db.pragma("journal_mode = WAL");
  }
  db.pragma("busy_timeout = 1000");
  db.pragma("foreign_keys = ON");

  // Schema migration
  initializeSchema(db);

  return new SessionPersistenceStore(db);
}

function initializeSchema(db: SqliteDatabase): void {
  db.exec(SCHEMA_SQL);
  db.exec(FTS_SQL);

  const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get();
  if (!row) {
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION);
  }
}

// ── Store ──

export class SessionPersistenceStore {
  private db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  // ── Session CRUD ──

  createSession(session: SessionRecord): void {
    this.withRetry(() => {
      this.db
        .prepare(
          `INSERT INTO sessions (
            id, source, user_id, agent_id, model, parent_session_id,
            started_at, ended_at, end_reason, message_count, tool_call_count,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            estimated_cost_usd, title
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          session.id,
          session.source,
          session.userId ?? null,
          session.agentId ?? null,
          session.model ?? null,
          session.parentSessionId ?? null,
          session.startedAt,
          session.endedAt ?? null,
          session.endReason ?? null,
          session.messageCount,
          session.toolCallCount,
          session.inputTokens,
          session.outputTokens,
          session.cacheReadTokens,
          session.cacheWriteTokens,
          session.estimatedCostUsd ?? null,
          session.title ?? null,
        );
    });
  }

  updateSession(
    sessionId: string,
    updates: Partial<
      Pick<
        SessionRecord,
        | "endedAt"
        | "endReason"
        | "messageCount"
        | "toolCallCount"
        | "inputTokens"
        | "outputTokens"
        | "cacheReadTokens"
        | "cacheWriteTokens"
        | "estimatedCostUsd"
        | "title"
      >
    >,
  ): void {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(updates)) {
      const col = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      sets.push(`${col} = ?`);
      values.push(value ?? null);
    }
    if (sets.length === 0) return;
    values.push(sessionId);
    this.withRetry(() => {
      this.db
        .prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`)
        .run(...values);
    });
  }

  getSession(sessionId: string): SessionRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(sessionId);
    return row ? rowToSessionRecord(row) : undefined;
  }

  listSessions(options?: {
    source?: string;
    limit?: number;
    offset?: number;
  }): SessionRecord[] {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const rows = options?.source
      ? this.db
          .prepare(
            "SELECT * FROM sessions WHERE source = ? ORDER BY started_at DESC LIMIT ? OFFSET ?",
          )
          .all(options.source, limit, offset)
      : this.db
          .prepare(
            "SELECT * FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?",
          )
          .all(limit, offset);
    return rows.map(rowToSessionRecord);
  }

  // ── Message CRUD ──

  appendMessage(message: MessageRecord): number {
    let lastId = 0;
    this.withRetry(() => {
      const result = this.db
        .prepare(
          `INSERT INTO messages (
            session_id, role, content, tool_call_id, tool_calls,
            tool_name, timestamp, token_count, finish_reason, reasoning
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          message.sessionId,
          message.role,
          message.content ?? null,
          message.toolCallId ?? null,
          message.toolCalls ?? null,
          message.toolName ?? null,
          message.timestamp,
          message.tokenCount ?? null,
          message.finishReason ?? null,
          message.reasoning ?? null,
        );
      lastId = Number(result.lastInsertRowid);
    });
    return lastId;
  }

  getMessages(
    sessionId: string,
    options?: { limit?: number; offset?: number },
  ): MessageRecord[] {
    const limit = options?.limit ?? 1000;
    const offset = options?.offset ?? 0;
    const rows = this.db
      .prepare(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?",
      )
      .all(sessionId, limit, offset);
    return rows.map(rowToMessageRecord);
  }

  // ── FTS search ──

  /**
   * Full-text search across all session messages.
   */
  searchMessages(
    query: string,
    options?: { limit?: number; sessionId?: string },
  ): SessionSearchResult[] {
    const limit = options?.limit ?? 20;
    // Sanitize FTS query: escape special characters
    const safeQuery = sanitizeFtsQuery(query);
    if (!safeQuery) return [];

    const sql = options?.sessionId
      ? `SELECT m.session_id, m.id AS message_id, m.role, m.content, m.timestamp,
               rank FROM messages_fts f
         JOIN messages m ON m.id = f.rowid
         WHERE messages_fts MATCH ? AND m.session_id = ?
         ORDER BY rank LIMIT ?`
      : `SELECT m.session_id, m.id AS message_id, m.role, m.content, m.timestamp,
               rank FROM messages_fts f
         JOIN messages m ON m.id = f.rowid
         WHERE messages_fts MATCH ?
         ORDER BY rank LIMIT ?`;

    const params = options?.sessionId
      ? [safeQuery, options.sessionId, limit]
      : [safeQuery, limit];

    const rows = this.db.prepare(sql).all(...params);
    return rows.map((row) => ({
      sessionId: row.session_id as string,
      messageId: row.message_id as number,
      role: row.role as string,
      content: (row.content as string) ?? "",
      timestamp: row.timestamp as number,
      rank: row.rank as number,
    }));
  }

  // ── Statistics ──

  sessionCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM sessions").get();
    return (row?.cnt as number) ?? 0;
  }

  messageCount(sessionId?: string): number {
    const row = sessionId
      ? this.db
          .prepare("SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?")
          .get(sessionId)
      : this.db.prepare("SELECT COUNT(*) as cnt FROM messages").get();
    return (row?.cnt as number) ?? 0;
  }

  // ── Export ──

  exportSession(sessionId: string): {
    session: SessionRecord;
    messages: MessageRecord[];
  } | undefined {
    const session = this.getSession(sessionId);
    if (!session) return undefined;
    const messages = this.getMessages(sessionId);
    return { session, messages };
  }

  // ── Cleanup ──

  close(): void {
    this.db.close();
  }

  // ── Internals ──

  private withRetry(fn: () => void): void {
    for (let attempt = 0; attempt < WRITE_MAX_RETRIES; attempt++) {
      try {
        fn();
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("SQLITE_BUSY") ||
          msg.includes("database is locked")
        ) {
          if (attempt === WRITE_MAX_RETRIES - 1) throw err;
          const jitter =
            WRITE_RETRY_MIN_MS +
            Math.random() * (WRITE_RETRY_MAX_MS - WRITE_RETRY_MIN_MS);
          blockSync(jitter);
          continue;
        }
        throw err;
      }
    }
  }
}

// ── Helpers ──

function blockSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Busy-wait (synchronous sleep for better-sqlite3)
  }
}

function sanitizeFtsQuery(query: string): string {
  // Remove FTS5 special characters that could cause syntax errors
  return query
    .replace(/[*"():^]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowToSessionRecord(row: Record<string, unknown>): SessionRecord {
  return {
    id: row.id as string,
    source: row.source as string,
    userId: (row.user_id as string) ?? undefined,
    agentId: (row.agent_id as string) ?? undefined,
    model: (row.model as string) ?? undefined,
    parentSessionId: (row.parent_session_id as string) ?? undefined,
    startedAt: row.started_at as number,
    endedAt: (row.ended_at as number) ?? undefined,
    endReason: (row.end_reason as string) ?? undefined,
    messageCount: (row.message_count as number) ?? 0,
    toolCallCount: (row.tool_call_count as number) ?? 0,
    inputTokens: (row.input_tokens as number) ?? 0,
    outputTokens: (row.output_tokens as number) ?? 0,
    cacheReadTokens: (row.cache_read_tokens as number) ?? 0,
    cacheWriteTokens: (row.cache_write_tokens as number) ?? 0,
    estimatedCostUsd: (row.estimated_cost_usd as number) ?? undefined,
    title: (row.title as string) ?? undefined,
  };
}

function rowToMessageRecord(row: Record<string, unknown>): MessageRecord {
  return {
    id: (row.id as number) ?? undefined,
    sessionId: row.session_id as string,
    role: row.role as string,
    content: (row.content as string) ?? undefined,
    toolCallId: (row.tool_call_id as string) ?? undefined,
    toolCalls: (row.tool_calls as string) ?? undefined,
    toolName: (row.tool_name as string) ?? undefined,
    timestamp: row.timestamp as number,
    tokenCount: (row.token_count as number) ?? undefined,
    finishReason: (row.finish_reason as string) ?? undefined,
    reasoning: (row.reasoning as string) ?? undefined,
  };
}
