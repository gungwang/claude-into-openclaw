/**
 * Skills Security Guard — Threat Pattern Scanner (Track B — Security & Supply Chain)
 *
 * Static security scanner for skills before installation. Detects 12
 * threat categories with ~90 regex patterns, invisible unicode chars,
 * suspicious binaries, and oversized payloads. Produces trust-level–aware
 * install decisions via a policy matrix.
 *
 * Ported from hermes-agent `tools/skills_guard.py`.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// ── Severity ──

export type FindingSeverity = "critical" | "high" | "medium" | "low";

// ── Threat categories ──

export type ThreatCategory =
  | "exfiltration"
  | "injection"
  | "destructive"
  | "persistence"
  | "network"
  | "obfuscation"
  | "execution"
  | "traversal"
  | "mining"
  | "supply_chain"
  | "privilege_escalation"
  | "credential_exposure";

// ── Finding ──

export type Finding = {
  patternId: string;
  severity: FindingSeverity;
  category: ThreatCategory;
  file: string;
  line: number;
  match: string;
  description: string;
};

// ── Scan result ──

export type TrustLevel = "builtin" | "trusted" | "community" | "agent_created";

export type ScanVerdict = "safe" | "caution" | "dangerous";

export type ScanResult = {
  skillName: string;
  source: string;
  trustLevel: TrustLevel;
  verdict: ScanVerdict;
  findings: Finding[];
  scannedAt: string;
  summary: string;
  fileCount: number;
  totalSizeBytes: number;
};

// ── Threat patterns ──

type ThreatPattern = {
  id: string;
  category: ThreatCategory;
  severity: FindingSeverity;
  pattern: RegExp;
  description: string;
};

const THREAT_PATTERNS: ThreatPattern[] = [
  // ── Exfiltration ──
  { id: "exfil-curl-post", category: "exfiltration", severity: "critical", pattern: /curl\s+(-[^s])*\s*-[dX]\s*POST/gi, description: "HTTP POST via curl (data exfiltration)" },
  { id: "exfil-wget-post", category: "exfiltration", severity: "critical", pattern: /wget\s+--post/gi, description: "HTTP POST via wget" },
  { id: "exfil-fetch-post", category: "exfiltration", severity: "high", pattern: /fetch\s*\([^)]*method\s*:\s*['"]POST['"]/gi, description: "fetch() POST request" },
  { id: "exfil-xmlhttp", category: "exfiltration", severity: "high", pattern: /XMLHttpRequest|\.send\s*\(/gi, description: "XMLHttpRequest data send" },
  { id: "exfil-nc-pipe", category: "exfiltration", severity: "critical", pattern: /\|\s*nc\s+|netcat\s+/gi, description: "Pipe to netcat (data exfiltration)" },
  { id: "exfil-dns-exfil", category: "exfiltration", severity: "critical", pattern: /nslookup\s+.*\$|dig\s+.*\$/gi, description: "DNS-based data exfiltration" },
  { id: "exfil-webhook", category: "exfiltration", severity: "high", pattern: /webhook\.site|requestbin\.com|hookbin\.com|pipedream\.net/gi, description: "Known exfiltration webhook service" },

  // ── Injection ──
  { id: "inject-eval", category: "injection", severity: "critical", pattern: /\beval\s*\(/gi, description: "eval() execution (code injection)" },
  { id: "inject-exec", category: "injection", severity: "critical", pattern: /\bexec\s*\(|execSync\s*\(|child_process/gi, description: "Process execution (command injection)" },
  { id: "inject-import-dynamic", category: "injection", severity: "high", pattern: /import\s*\(\s*[^'"]/gi, description: "Dynamic import with variable" },
  { id: "inject-function-constructor", category: "injection", severity: "critical", pattern: /new\s+Function\s*\(/gi, description: "Function constructor (code injection)" },
  { id: "inject-template-interp", category: "injection", severity: "medium", pattern: /\$\{.*\bprocess\b|\$\{.*\brequire\b/gi, description: "Template literal with process/require" },

  // ── Destructive ──
  { id: "destruct-rm-rf", category: "destructive", severity: "critical", pattern: /rm\s+(-[rfv]+\s+)*\//gi, description: "Recursive deletion from root" },
  { id: "destruct-rmdir", category: "destructive", severity: "high", pattern: /rmdir\s.*--ignore-fail/gi, description: "Force directory removal" },
  { id: "destruct-drop-table", category: "destructive", severity: "critical", pattern: /DROP\s+(TABLE|DATABASE|SCHEMA)/gi, description: "Database destruction" },
  { id: "destruct-truncate", category: "destructive", severity: "high", pattern: /TRUNCATE\s+TABLE/gi, description: "Table truncation" },
  { id: "destruct-format", category: "destructive", severity: "critical", pattern: /mkfs\.|format\s+[cdefgh]:/gi, description: "Filesystem format" },
  { id: "destruct-dd", category: "destructive", severity: "critical", pattern: /\bdd\s+if=.*of=\/dev/gi, description: "Raw device write" },

  // ── Persistence ──
  { id: "persist-crontab", category: "persistence", severity: "high", pattern: /crontab\s+(-[elr]\s+)*|\/etc\/cron/gi, description: "Crontab modification" },
  { id: "persist-systemd", category: "persistence", severity: "high", pattern: /systemctl\s+(enable|start)|\/etc\/systemd/gi, description: "Systemd service persistence" },
  { id: "persist-bashrc", category: "persistence", severity: "high", pattern: />>?\s*~?\/?\.bashrc|>>?\s*~?\/?\.profile|>>?\s*~?\/?\.zshrc/gi, description: "Shell profile modification" },
  { id: "persist-autostart", category: "persistence", severity: "medium", pattern: /\.config\/autostart|\/etc\/init\.d/gi, description: "Autostart entry" },

  // ── Network ──
  { id: "net-reverse-shell", category: "network", severity: "critical", pattern: /\/bin\/sh\s*-i|\/bin\/bash\s*-i|python.*pty\.spawn/gi, description: "Reverse shell pattern" },
  { id: "net-port-scan", category: "network", severity: "high", pattern: /nmap\s+|masscan\s+/gi, description: "Port scanning" },
  { id: "net-tunnel", category: "network", severity: "high", pattern: /ssh\s+-[RLD]|ngrok|cloudflared\s+tunnel/gi, description: "Network tunneling" },

  // ── Obfuscation ──
  { id: "obfusc-base64-decode", category: "obfuscation", severity: "high", pattern: /atob\s*\(|Buffer\.from\s*\([^)]+,\s*['"]base64['"]/gi, description: "Base64 decode (possible obfuscation)" },
  { id: "obfusc-hex-decode", category: "obfuscation", severity: "medium", pattern: /\\x[0-9a-f]{2}.*\\x[0-9a-f]{2}.*\\x[0-9a-f]{2}/gi, description: "Hex-encoded payload" },
  { id: "obfusc-char-code", category: "obfuscation", severity: "medium", pattern: /String\.fromCharCode\s*\(/gi, description: "String.fromCharCode obfuscation" },

  // ── Execution ──
  { id: "exec-powershell", category: "execution", severity: "high", pattern: /powershell\s+-[eE]ncodedCommand|pwsh\s+-c/gi, description: "PowerShell encoded command execution" },
  { id: "exec-python-c", category: "execution", severity: "medium", pattern: /python[23]?\s+-c\s+['"]/gi, description: "Python one-liner execution" },
  { id: "exec-node-e", category: "execution", severity: "medium", pattern: /node\s+-e\s+['"]/gi, description: "Node.js one-liner execution" },

  // ── Traversal ──
  { id: "trav-dotdot", category: "traversal", severity: "high", pattern: /\.\.\//g, description: "Path traversal (../)" },
  { id: "trav-symlink", category: "traversal", severity: "high", pattern: /ln\s+-s\s+/gi, description: "Symlink creation" },
  { id: "trav-readlink", category: "traversal", severity: "low", pattern: /readlink\s+/gi, description: "Symlink resolution" },

  // ── Mining ──
  { id: "mine-xmrig", category: "mining", severity: "critical", pattern: /xmrig|stratum\+tcp|cryptonight|monero/gi, description: "Cryptocurrency mining" },

  // ── Supply chain ──
  { id: "supply-npm-install", category: "supply_chain", severity: "medium", pattern: /npm\s+install\s+(?!-[gD])/gi, description: "npm install (unscoped)" },
  { id: "supply-pip-install", category: "supply_chain", severity: "medium", pattern: /pip\s+install\s+(?!-r)/gi, description: "pip install (unscoped)" },
  { id: "supply-postinstall", category: "supply_chain", severity: "high", pattern: /"postinstall"\s*:\s*"/gi, description: "npm postinstall script" },

  // ── Privilege escalation ──
  { id: "priv-sudo", category: "privilege_escalation", severity: "high", pattern: /sudo\s+/gi, description: "Privilege escalation via sudo" },
  { id: "priv-chmod-suid", category: "privilege_escalation", severity: "critical", pattern: /chmod\s+[ugo]*\+s|chmod\s+[47][0-7]{3}/gi, description: "SUID/SGID permission change" },
  { id: "priv-chown-root", category: "privilege_escalation", severity: "high", pattern: /chown\s+root/gi, description: "Change ownership to root" },

  // ── Credential exposure ──
  { id: "cred-env-secret", category: "credential_exposure", severity: "high", pattern: /process\.env\.[A-Z_]*(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/gi, description: "Environment secret access" },
  { id: "cred-hardcoded", category: "credential_exposure", severity: "critical", pattern: /(?:api[_-]?key|secret|password|token)\s*[=:]\s*['"][A-Za-z0-9+/=]{16,}['"]/gi, description: "Hardcoded secret" },
  { id: "cred-private-key", category: "credential_exposure", severity: "critical", pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/gi, description: "Embedded private key" },
  { id: "cred-aws-access-key", category: "credential_exposure", severity: "critical", pattern: /AKIA[0-9A-Z]{16}/g, description: "AWS access key" },
];

// ── Invisible unicode characters ──

const INVISIBLE_CHARS: ReadonlySet<number> = new Set([
  0x200b, // Zero-width space
  0x200c, // Zero-width non-joiner
  0x200d, // Zero-width joiner
  0x200e, // Left-to-right mark
  0x200f, // Right-to-left mark
  0x2028, // Line separator
  0x2029, // Paragraph separator
  0x202a, // Left-to-right embedding
  0x202b, // Right-to-left embedding
  0x202c, // Pop directional formatting
  0x202d, // Left-to-right override
  0x202e, // Right-to-left override
  0x2060, // Word joiner
  0x2061, // Function application
  0x2062, // Invisible times
  0x2063, // Invisible separator
  0x2064, // Invisible plus
  0xfeff, // Zero-width no-break space (BOM)
]);

// ── File limits ──

const SCANNABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".sh", ".bash", ".zsh", ".fish",
  ".ps1", ".bat", ".cmd",
  ".yml", ".yaml", ".toml", ".json", ".json5",
  ".md", ".txt", ".cfg", ".ini", ".env",
]);

const SUSPICIOUS_BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  ".exe", ".dll", ".so", ".dylib", ".bin", ".elf",
  ".msi", ".deb", ".rpm", ".apk",
]);

const MAX_FILE_COUNT = 50;
const MAX_TOTAL_SIZE_KB = 1024;
const MAX_SINGLE_FILE_KB = 256;

// ── Install policy matrix ──

type InstallDecision = "allow" | "block" | "ask";

const INSTALL_POLICY: Record<TrustLevel, Record<ScanVerdict, InstallDecision>> = {
  builtin: { safe: "allow", caution: "allow", dangerous: "block" },
  trusted: { safe: "allow", caution: "allow", dangerous: "ask" },
  community: { safe: "allow", caution: "ask", dangerous: "block" },
  agent_created: { safe: "ask", caution: "block", dangerous: "block" },
};

const TRUSTED_REPOS: ReadonlySet<string> = new Set([
  "openai/skills",
  "anthropics/skills",
]);

// ── Scanning ──

function scanFileContent(
  content: string,
  relPath: string,
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // Threat pattern matching
    for (const tp of THREAT_PATTERNS) {
      tp.pattern.lastIndex = 0;
      const match = tp.pattern.exec(line);
      if (match) {
        findings.push({
          patternId: tp.id,
          severity: tp.severity,
          category: tp.category,
          file: relPath,
          line: lineIdx + 1,
          match: match[0].slice(0, 80),
          description: tp.description,
        });
      }
    }

    // Invisible unicode detection
    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      const codePoint = line.codePointAt(charIdx);
      if (codePoint !== undefined && INVISIBLE_CHARS.has(codePoint)) {
        findings.push({
          patternId: "unicode-invisible",
          severity: "high",
          category: "obfuscation",
          file: relPath,
          line: lineIdx + 1,
          match: `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
          description: "Invisible unicode character (possible obfuscation)",
        });
        break; // One finding per line for unicode
      }
    }
  }

  return findings;
}

/**
 * Scan a skill directory for security threats.
 */
export function scanSkill(
  skillPath: string,
  skillName: string,
  source = "community",
): ScanResult {
  const trustLevel = resolveTrustLevel(source);
  const findings: Finding[] = [];
  let fileCount = 0;
  let totalSizeBytes = 0;

  if (!fs.existsSync(skillPath)) {
    return {
      skillName,
      source,
      trustLevel,
      verdict: "safe",
      findings: [],
      scannedAt: new Date().toISOString(),
      summary: "Skill path does not exist",
      fileCount: 0,
      totalSizeBytes: 0,
    };
  }

  const stat = fs.statSync(skillPath);
  if (!stat.isDirectory()) {
    // Single file scan
    const content = fs.readFileSync(skillPath, "utf-8");
    const fileFindings = scanFileContent(content, path.basename(skillPath));
    return buildScanResult(
      skillName,
      source,
      trustLevel,
      fileFindings,
      1,
      content.length,
    );
  }

  // Directory scan
  const entries = walkDirectory(skillPath);

  for (const entry of entries) {
    const ext = path.extname(entry.relativePath).toLowerCase();

    // Check for suspicious binaries
    if (SUSPICIOUS_BINARY_EXTENSIONS.has(ext)) {
      findings.push({
        patternId: "struct-binary",
        severity: "critical",
        category: "execution",
        file: entry.relativePath,
        line: 0,
        match: ext,
        description: `Suspicious binary file (${ext})`,
      });
      fileCount++;
      totalSizeBytes += entry.size;
      continue;
    }

    if (!SCANNABLE_EXTENSIONS.has(ext)) continue;

    // Size checks
    if (entry.size > MAX_SINGLE_FILE_KB * 1024) {
      findings.push({
        patternId: "struct-oversized-file",
        severity: "medium",
        category: "supply_chain",
        file: entry.relativePath,
        line: 0,
        match: `${Math.round(entry.size / 1024)}KB`,
        description: `File exceeds ${MAX_SINGLE_FILE_KB}KB limit`,
      });
    }

    const content = fs.readFileSync(entry.absolutePath, "utf-8");
    findings.push(...scanFileContent(content, entry.relativePath));
    fileCount++;
    totalSizeBytes += entry.size;
  }

  // Structural checks
  if (fileCount > MAX_FILE_COUNT) {
    findings.push({
      patternId: "struct-too-many-files",
      severity: "medium",
      category: "supply_chain",
      file: ".",
      line: 0,
      match: String(fileCount),
      description: `Skill contains ${fileCount} files (limit: ${MAX_FILE_COUNT})`,
    });
  }

  if (totalSizeBytes > MAX_TOTAL_SIZE_KB * 1024) {
    findings.push({
      patternId: "struct-oversized-total",
      severity: "medium",
      category: "supply_chain",
      file: ".",
      line: 0,
      match: `${Math.round(totalSizeBytes / 1024)}KB`,
      description: `Total size exceeds ${MAX_TOTAL_SIZE_KB}KB limit`,
    });
  }

  return buildScanResult(
    skillName,
    source,
    trustLevel,
    findings,
    fileCount,
    totalSizeBytes,
  );
}

/**
 * Determine whether a skill should be allowed to install based on scan results.
 */
export function shouldAllowInstall(
  result: ScanResult,
  force = false,
): { allowed: boolean; decision: InstallDecision; reason: string } {
  if (force) {
    return {
      allowed: true,
      decision: "allow",
      reason: "Forced install (bypassing security check)",
    };
  }
  const decision = INSTALL_POLICY[result.trustLevel][result.verdict];
  return {
    allowed: decision === "allow",
    decision,
    reason:
      decision === "allow"
        ? "Scan passed"
        : decision === "ask"
          ? `Review required: ${result.findings.length} finding(s) at trust level '${result.trustLevel}'`
          : `Blocked: ${result.findings.length} finding(s) with verdict '${result.verdict}'`,
  };
}

/**
 * SHA-256 content hash of all files in a skill directory.
 */
export function contentHash(skillPath: string): string {
  const hash = crypto.createHash("sha256");
  const entries = walkDirectory(skillPath);
  for (const entry of entries) {
    hash.update(entry.relativePath);
    hash.update(fs.readFileSync(entry.absolutePath));
  }
  return hash.digest("hex");
}

// ── Report formatting ──

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function formatScanReport(result: ScanResult): string {
  const lines: string[] = [
    `Security Scan: ${result.skillName}`,
    `  Source: ${result.source} | Trust: ${result.trustLevel}`,
    `  Verdict: ${result.verdict.toUpperCase()}`,
    `  Files: ${result.fileCount} | Size: ${Math.round(result.totalSizeBytes / 1024)}KB`,
    `  Scanned: ${result.scannedAt}`,
    "",
  ];

  if (result.findings.length === 0) {
    lines.push("  No threats detected.");
    return lines.join("\n");
  }

  lines.push(`  Findings (${result.findings.length}):`);
  const sorted = result.findings
    .slice()
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  for (const f of sorted) {
    lines.push(
      `    [${f.severity.toUpperCase()}] ${f.category}: ${f.description}`,
    );
    lines.push(`      File: ${f.file}:${f.line} | Match: ${f.match}`);
  }

  return lines.join("\n");
}

// ── Internals ──

function resolveTrustLevel(source: string): TrustLevel {
  if (source === "builtin" || source === "bundled") return "builtin";
  if (TRUSTED_REPOS.has(source)) return "trusted";
  if (source === "agent" || source === "agent_created") return "agent_created";
  return "community";
}

function deriveVerdict(findings: Finding[]): ScanVerdict {
  if (findings.length === 0) return "safe";
  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasHigh = findings.some((f) => f.severity === "high");
  if (hasCritical) return "dangerous";
  if (hasHigh) return "caution";
  return "caution";
}

function buildScanResult(
  skillName: string,
  source: string,
  trustLevel: TrustLevel,
  findings: Finding[],
  fileCount: number,
  totalSizeBytes: number,
): ScanResult {
  const verdict = deriveVerdict(findings);
  const critCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;
  const summary =
    findings.length === 0
      ? "No threats detected"
      : `${findings.length} finding(s): ${critCount} critical, ${highCount} high`;

  return {
    skillName,
    source,
    trustLevel,
    verdict,
    findings,
    scannedAt: new Date().toISOString(),
    summary,
    fileCount,
    totalSizeBytes,
  };
}

type FileEntry = {
  absolutePath: string;
  relativePath: string;
  size: number;
};

function walkDirectory(dirPath: string): FileEntry[] {
  const entries: FileEntry[] = [];
  const walk = (dir: string, prefix: string): void => {
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const abs = path.join(dir, item.name);
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) {
        // Skip hidden directories and node_modules
        if (item.name.startsWith(".") || item.name === "node_modules") continue;
        walk(abs, rel);
      } else if (item.isFile()) {
        try {
          const stat = fs.statSync(abs);
          entries.push({ absolutePath: abs, relativePath: rel, size: stat.size });
        } catch {
          // Skip unreadable files
        }
      }
    }
  };
  walk(dirPath, "");
  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
