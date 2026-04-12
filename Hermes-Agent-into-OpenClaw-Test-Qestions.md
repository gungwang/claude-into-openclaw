# Hermes-Agent into OpenClaw Test Questions

Generated from [HERMES_OPENCLAW_TECHNICAL_REFERENCE.md](/home/wang/projects/claud-code-src/claw-code/HERMES_OPENCLAW_TECHNICAL_REFERENCE.md) to help exercise the new Hermes-derived capabilities inside the OpenClaw chat bot.

## Test Questions & Tasks by Track

### Track A - Session Intelligence

1. Error Classification: "I'm getting a 429 error from the OpenAI API. What does that mean and should I retry?"
2. Credential Rotation: "I have 3 API keys for Anthropic. Can you rotate to the next working one? The current key is rate-limited."
3. Rate Limiting: "Show me my current rate limit usage across providers."
4. Session Persistence: "Search my previous sessions for the conversation where I worked on the Docker setup."
5. Trajectory Compression: "This conversation is getting long. Can you compress the earlier turns and summarize what we've done so far?"
6. Smart Model Routing: "I need to analyze 15 files and refactor them. Which model should handle this task and what will it cost?"

### Track B - Supply Chain Security

7. Skills Guard: "Scan the skill at `./my-custom-skill/` for security threats before I install it."
8. Skills Sync: "Synchronize bundled skills to my local skills directory and tell me which ones were updated."
9. URL Safety: "Is this URL safe to fetch? `http://169.254.169.254/latest/meta-data/`"
10. Path Security: "Check if the path `../../etc/passwd` is safe to access from my project directory."
11. Sensitive Files: "Scan my project directory for any sensitive files like `.env`, private keys, or credentials."

### Track C - Developer Experience

12. Git Worktree: "Create an isolated git worktree so I can work on a new feature without disturbing my main branch."
13. Prompt Caching: "Apply prompt caching breakpoints for Anthropic to reduce token costs on repeated system prompts."
14. Context References: "Expand `@file:src/index.ts` and `@git:HEAD~3` and include them in this conversation."
15. Budget Tracker: "What's my current session cost? How much budget do I have left?"
16. Checkpoint Manager: "Create a checkpoint of my working directory before I make these changes. If something breaks, I want to roll back."
17. Rollback: "List all checkpoints and roll back the file `src/config.ts` to the version from 3 turns ago."

### Track D - Plugin Enhancements

18. Plugin Hooks: "Register a `pre_tool_call` hook that logs every tool invocation with a timestamp."
19. Context Engine: "Use the plugin RAG engine to retrieve relevant code snippets for 'authentication middleware'."
20. Message Injection: "Inject a high-priority system message reminding me about the API deprecation deadline."

### Track E - Advanced Tools

21. Browser Automation: "Open `https://example.com` in a browser session, take a snapshot of the page, and describe what you see."
22. Browser Click: "Navigate to `http://localhost:3000`, click the 'Login' button, and type my username in the input field."
23. Mixture of Agents: "Use multiple models to answer this question and aggregate their responses: 'What are the best practices for microservice error handling?'"
24. Voice TTS: "Convert this text to speech using the Edge TTS provider: 'Hello, welcome to OpenClaw.'"
25. Process Monitor: "Start `npm run dev` in the background, watch for the pattern 'ready on port', and notify me when it's ready."
26. Home Assistant: "List all light entities in my living room and turn on the main ceiling light."

### Track F - Gateway Platforms

27. WeCom: "Send a markdown message to user `zhangsan` via WeCom: '## Build Passed ✅\nAll 42 tests green.'"
28. DingTalk: "Send a text notification to the team DingTalk webhook about the deployment completion."
29. Feishu/Lark: "Send an interactive card to the Feishu chat with the build status summary."
30. Gateway Mirroring: "Mirror this conversation to the API session so my team can see it in the web dashboard."
31. Multi-Destination: "Deliver this status update to Slack, DingTalk, and Feishu simultaneously using the 'all' delivery policy."

### Track G - Training & Evaluation Pipeline

32. Trajectory Format: "Convert this conversation into Hermes-compatible JSONL trajectory format and save it."
33. Toolset Sampling: "Sample a toolset using the 'research' distribution and tell me which tools were selected."
34. Batch Runner: "Run a batch of 50 prompts from `dataset.jsonl` using the 'development' distribution with 4 workers."
35. Execution Environments: "Set up a Docker execution environment using the `python:3.11` image for running benchmark tasks."
36. Tool Call Parsers: "Parse this raw model output for tool calls using the `deepseek_v3` parser."
37. Benchmarks: "Run the TerminalBench2 benchmark suite and show me the evaluation summary."
38. RL Training: "Check if all requirements are met for RL training, then start a training run with `gpt-4o-mini`."

### Cross-Track Integration Tests

39. Error -> Fallback -> Routing: "If my Anthropic key gets rate-limited, automatically classify the error, rotate to the next credential, and reroute the task to an OpenAI model."
40. Budget + Checkpoint: "Set a $0.50 budget for this session. Create automatic checkpoints before each tool call. Warn me when I hit 80%."
41. Context Refs + URL Safety: "Expand `@url:https://internal-api.company.com/secret` - but first validate that the URL is safe."
42. Skills Guard + Install: "Scan this community skill for threats. If it's safe, install it. If it has critical findings, block the install and show me the report."
43. Browser + Process Monitor: "Start my dev server with `npm run dev`, wait until it's ready, then open `localhost:3000` in the browser and take a screenshot."