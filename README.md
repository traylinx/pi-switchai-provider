# @switchai/pi-provider

A [pi coding agent](https://github.com/mariozechner/pi-mono) provider extension that routes chat completions through [switchAILocal](https://github.com/traylinx/switchAILocal) — a local unified gateway that fronts Gemini CLI, Claude Code, Codex, OpenCode, Vibe (use your existing tool subscriptions), local models (Ollama, LM Studio), and cloud APIs (MiniMax, Anthropic, OpenAI, Google Gemini, Groq) behind a single OpenAI-compatible endpoint at `http://localhost:18080`.

> **Status:** `v0.3.0` — dynamic discovery + glob allowlist. The extension queries the gateway's `/models` endpoint at load and registers the intersection of curated metadata and live gateway models. `AIL_MODELS` lets you trim registrations to a focused subset. OAuth passthrough, live capability probing, and real cost reporting are still on the roadmap.

## Why

`pi` ships built-in providers for OpenAI, Anthropic, Google, Groq, xAI, Bedrock, and friends — but if you run a local gateway that fronts all of them behind one endpoint, you don't want to juggle N API keys and N `--provider` flags. This extension gives you a single `switchai` provider that:

- Uses one env var: `AIL_API_KEY`
- Points at one URL (default `http://localhost:18080/v1`, override with `AIL_BASE_URL`)
- Auto-discovers whichever models your `switchAILocal` config exposes — no rebuild when the upstream list changes

## Install

### Project-local (recommended while iterating)

```bash
cd your-project
pi install github:traylinx/pi-switchai-provider
```

`pi install` drops the extension under `.pi/extensions/` and the provider registers on the next `pi` invocation — no rebuild, no config edit.

### Global

```bash
pi install -g github:traylinx/pi-switchai-provider
```

Installs under `~/.pi/agent/extensions/` so every project picks it up.

### Development (symlink from a checkout)

```bash
git clone https://github.com/traylinx/pi-switchai-provider ~/src/pi-switchai-provider
ln -s ~/src/pi-switchai-provider your-project/.pi/extensions/switchai-provider
```

`pi`'s extension loader follows symlinks, so edits in `~/src/pi-switchai-provider/index.ts` are picked up on the next `pi` run (or `/reload` inside a session).

## Prerequisites

1. **switchAILocal** running and reachable (default `http://localhost:18080`). Start it with:
   ```bash
   # Quickest: npx (no checkout needed)
   npx @traylinx/switchailocal
   # Or from a checkout
   cd ~/src/switchAILocal && ./ail.sh start
   ```
2. **`AIL_API_KEY`** exported in your shell:
   ```bash
   export AIL_API_KEY=sk-your-key
   ```
3. **`pi`** `>=0.67.0`.

### Environment variables

| Var            | Required | Default                      | Purpose                                                                                                  |
|----------------|----------|------------------------------|----------------------------------------------------------------------------------------------------------|
| `AIL_API_KEY`  | yes      | —                            | Bearer token forwarded to the gateway.                                                                   |
| `AIL_BASE_URL` | no       | `http://localhost:18080/v1`  | Point at a remote gateway. Trailing slash and missing `/vN` suffix are handled — `http://host:8080` works. |

Use `AIL_BASE_URL` to share one extension across a local gateway and a [Tytus](https://github.com/traylinx/tytus) private pod, e.g. `AIL_BASE_URL=http://10.42.42.1:18080/v1 pi`.

## Usage

```bash
# Uses pi's default selection logic (most recently selected switchai model).
pi --provider switchai

# Pick specific models — any ID the gateway exposes works:
pi --provider switchai --model claude-opus-4-6
pi --provider switchai --model gpt-5.4
pi --provider switchai --model gemini-2.5-pro
pi --provider switchai --model minimax:MiniMax-M2.7

# Check gateway connectivity and counts from inside pi
/switchai-status
```

## How model discovery works

On extension load, the factory queries `${AIL_BASE_URL}/models` and merges the response against an internal curated metadata overlay. The result is registered with `pi.registerProvider("switchai", …)`.

**Three-tier registration:**

1. **Curated + present in gateway** — registered with full metadata (reasoning flags, input modalities, real context/max-output limits, cost). ~20 models: the Claude 4.5/4.6 family, GPT-5.4/5.2/5-mini, Gemini 2.5 Pro/Flash/Flash-Lite, DeepSeek v3.2, Qwen3 Max, Kimi K2.5, GLM 4.6/4.7, MiniMax M2.7/M2.5, Xiaomi MiMo v2 Omni.
2. **Unknown chat model in gateway** — registered with conservative defaults: text-only, non-reasoning, 128K context, 8K max output, cost = 0.
3. **Non-chat in gateway** — skipped entirely. Filtered by regex against `embed|image|dall|flux|whisper|tts|asr|rerank|-mt-|-ocr|…` to keep embeddings, image-gen, TTS, and translation models out of the chat-completions selector.

**Fallback when the gateway is unreachable:** the full 20-model curated list is registered anyway (blind) so the extension still boots and pi can render a selector. A warning is written to stderr.

### Startup log

Every load prints one line to stderr:

```
[switchai] http://localhost:18080/v1 → 411 models on gateway · 20 curated + 284 with defaults registered (107 non-chat filtered)
```

## Commands

- **`/switchai-status`** — pings `${AIL_BASE_URL}/models` with `AIL_API_KEY` and reports the gateway URL, total model count, and the curated/default split that was registered at startup.

## Adding curated metadata for a new model

Open `index.ts`, find `CURATED_METADATA`, and add an entry keyed by the exact gateway model ID:

```ts
"your-model-id": {
  name: "Your Model",
  reasoning: true,
  input: ["text", "image"],
  cost: { input: 1.25, output: 5, cacheRead: 0.12, cacheWrite: 0 },
  contextWindow: 200_000,
  maxTokens: 32_000,
},
```

Cost is per million tokens. Reload with pi's `/reload` or restart.

## Roadmap

v0.2.0 covers dynamic discovery, configurable baseUrl, and a real startup health check. v0.3.0 adds the `AIL_MODELS` glob allowlist.

Still planned:

- **Per-model capability probe.** Switch from a hand-maintained `CURATED_METADATA` overlay to live metadata from a richer gateway endpoint (`/v1/models/{id}` with `context_length`, `supports_vision`, `supports_reasoning`, pricing) once `switchAILocal` exposes one.
- **OAuth passthrough.** Let the extension reuse `switchAILocal`'s upstream OAuth flows (Anthropic Pro/Max, Google, GitHub Copilot) so users don't need a separate `AIL_API_KEY`.
- **Real cost reporting.** Pull per-token pricing from the gateway so `pi`'s session cost tracker reflects reality for paid upstreams instead of showing 0.
- **Streaming metadata.** Surface the upstream provider (`owned_by`) in pi's stream events for better telemetry.
- **Multimodal omni.** Wire `mimo-v2-omni` audio/video inputs through once pi gains non-image media support.

Contributions welcome.

## License

Apache-2.0 © Makakoo / Traylinx. See [LICENSE](./LICENSE).
