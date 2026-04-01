# Good First Issues

These starter issues are derived directly from the OpenClaw improvement spec and are intended to help new contributors make useful, scoped progress.

## 1. Add canonical IDs to registry entries

- **Spec track:** Track A
- **Goal:** Introduce stable, namespaced IDs for command and tool entries
- **Why it matters:** Reduces ambiguity and makes routing and audits safer
- **Suggested output:** Data model update plus one validation path for duplicate IDs

## 2. Add route explainability output

- **Spec track:** Track B
- **Goal:** Add a debug-friendly explanation format for routing decisions
- **Why it matters:** Makes misrouting visible and easier to diagnose
- **Suggested output:** Top candidate list with score or reason breakdown

## 3. Generate a maturity-level report artifact

- **Spec track:** Track C
- **Goal:** Produce a machine-readable report for tool or feature maturity levels
- **Why it matters:** Turns vague parity claims into measurable status
- **Suggested output:** CLI output or artifact file documenting L0-L4 levels

## 4. Surface policy reason codes in verbose mode

- **Spec track:** Track D
- **Goal:** Expose structured deny/allow reason codes in diagnostics
- **Why it matters:** Improves supportability, trust, and governance clarity
- **Suggested output:** Structured verbose event or debug text showing the policy reason

## 5. Scaffold mode contract tests

- **Spec track:** Track E
- **Goal:** Create a first pass of tests for remote, SSH, teleport, or direct modes
- **Why it matters:** Prevents behavior drift across runtime modes
- **Suggested output:** Test skeletons and a documented failure taxonomy

## Suggested Labels

- `good first issue`
- `help wanted`
- `documentation`
- `enhancement`
- `governance`
