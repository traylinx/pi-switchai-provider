# @switchai/pi-provider

A [pi coding agent](https://github.com/mariozechner/pi-mono) provider extension that routes chat completions through [switchAILocal](../switchAILocal) — a unified OpenAI-compatible gateway to MiniMax, Anthropic, Gemini, Ollama, Groq, and other upstream model providers.

> **Status:** `v0.1.0` — first working draft. Model list is hand-curated against `switchAILocal`'s typical `config.yaml`. Dynamic model discovery, OAuth, and streaming metadata enrichment are on the roadmap.

## Why

`pi` ships built-in providers for OpenAI, Anthropic, Google, Groq, xAI, Bedrock, and friends — but if you run a local gateway that fronts all of them behind one endpoint, you don't want to juggle N API keys and N `--provider` flags. This extension gives you a single `switchai` provider that:

- Uses one env var: `AIL_API_KEY`
- Points at one URL: `http://localhost:18080/v1`
- Lets `pi` see every model your `switchAILocal` config exposes as `provider:model_id`

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

1. **switchAILocal** running and reachable at `http://localhost:18080`. Start it with:
   ```bash
   cd switchAILocal && ./ail.sh
   ```
2. **`AIL_API_KEY`** exported in your shell:
   ```bash
   export AIL_API_KEY=sk-your-key
   ```
3. **`pi`** `>=0.67.0`.

## Usage

```bash
# Default model (MiniMax-M2.7 via switchai)
pi --provider switchai

# Pick a specific model
pi --provider switchai --model minimax:MiniMax-M2.7
pi --provider switchai --model anthropic:claude-opus-4-6
pi --provider switchai --model switchai:switchai-reasoner

# Check gateway connectivity from inside pi
/switchai-status
```

## Bundled models

| Model ID                         | Context | Max out | Reasoning | Images |
|----------------------------------|---------|---------|-----------|--------|
| `minimax:MiniMax-M2.7` (default) | 1M      | 16K     | yes       | no     |
| `minimax:MiniMax-M2`             | 1M      | 16K     | yes       | no     |
| `anthropic:claude-sonnet-4-6`    | 1M      | 64K     | yes       | yes    |
| `anthropic:claude-opus-4-6`      | 1M      | 128K    | yes       | yes    |
| `switchai:switchai-fast`         | 128K    | 16K     | no        | no     |
| `switchai:switchai-reasoner`     | 128K    | 16K     | yes       | no     |

The model IDs use `<upstream>:<model>` format so `switchAILocal` can route them to the correct backend. The list is intentionally hand-curated for v0.1.0 — if your `switchAILocal` exposes a model that isn't listed, fall back to a built-in provider for now or add it to `SWITCHAI_MODELS` in `index.ts`.

## Commands

- `/switchai-status` — pings `http://localhost:18080/v1/models` with `AIL_API_KEY` and reports how many models the gateway currently exposes.

## Roadmap

This release covers the minimum needed to make `pi --provider switchai` work end-to-end. Planned follow-ups:

- **Dynamic model discovery.** Replace the hand-curated `SWITCHAI_MODELS` list with a startup fetch of `GET /v1/models` so the extension auto-tracks whatever `switchAILocal`'s `config.yaml` exposes.
- **Per-model capability probe.** Query the gateway's model metadata endpoint to fill in `reasoning`, `input` modalities, `contextWindow`, and `cost` instead of hardcoding them.
- **OAuth passthrough.** Support `switchAILocal`'s upstream OAuth flows (Anthropic Pro/Max, Google) so users don't need a separate `AIL_API_KEY`.
- **Health check on startup.** Warn loudly if the gateway isn't reachable instead of waiting for the first completion to fail.
- **Cost reporting.** Pull real per-token pricing from `switchAILocal` so `pi`'s session cost tracker reflects reality for paid upstreams.
- **Configurable `baseUrl`.** Read `AIL_BASE_URL` so users can point at a remote `switchAILocal` instance instead of `localhost:18080`.
- **Streaming metadata.** Surface upstream provider info in the stream events for better telemetry inside `pi`.

Contributions welcome — see `CONTRIBUTING.md` (TODO) and the issue tracker.

## License

Apache-2.0 © Makakoo / Traylinx. See [LICENSE](./LICENSE).
