# Changelog

All notable changes to `@traylinx/pi-switchai-provider` are documented here.
(Package originally intended as `@switchai/pi-provider`; renamed before first npm publish.)

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.3.0] — 2026-04-16

### Added

- **`AIL_MODELS` glob allowlist.** Set `AIL_MODELS="claude-*,gpt-5*,minimax:*"` to register only models matching at least one glob pattern, trimming the full gateway registration down to what you actually need. `*` matches any characters. Empty/unset = no filter (register everything). The allowlist applies in both live-discovery and fallback modes, and is surfaced in the startup banner.

### Changed

- Startup banner now includes an `allowlistActive` note and a warning when `AIL_MODELS` matches zero models.

## [0.2.0] — 2026-04-15

### Added

- **Dynamic model discovery.** The extension now queries `${AIL_BASE_URL}/models` at load and registers only the models the gateway actually exposes — no hardcoded list maintenance.
- **Configurable base URL.** `AIL_BASE_URL` overrides the default `http://localhost:18080/v1`. Handles trailing slashes and missing `/vN` suffix automatically.
- **Startup health check.** The extension prints a one-line banner to stderr on load: model counts, gateway URL, non-chat filtered count.
- **`/switchai-status` slash command.** Pings the gateway from inside a pi session and shows connectivity + model counts.

### Fixed

- v0.1.0 shipped with five of six hardcoded model IDs that don't exist in the gateway (`anthropic:claude-sonnet-4-6`, `minimax:MiniMax-M2`, `switchai:switchai-fast`, `switchai:switchai-reasoner`). Dynamic discovery eliminates this entire class of fantasy-ID bugs.
- `/switchai-status` was double-suffixing `/v1` (URL already ends in `/v1`, so `baseUrl + /v1/models` → `/v1/v1/models`).

## [0.1.0] — 2026-04-15

### Added

- Initial release. Registers a `switchai` provider with a hardcoded 20-model curated list (Claude 4.5/4.6, GPT-5.4/5.2/5-mini, Gemini 2.5 Pro/Flash/Flash-Lite, DeepSeek v3.2, Qwen3 Max, Kimi K2.5, GLM 4.6/4.7, MiniMax M2.7/M2.5, Xiaomi MiMo v2 Omni).
- Single env var: `AIL_API_KEY`. Default base URL: `http://localhost:18080/v1`.
- Basic stderr startup banner.
