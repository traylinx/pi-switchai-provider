/**
 * switchai Provider Extension for pi
 *
 * Registers the `switchai` provider which routes through a switchAILocal
 * gateway (OpenAI-compatible). At load time the extension queries the
 * gateway's `/models` endpoint and registers the *intersection* of:
 *
 *   (a) a curated metadata overlay with known reasoning / image / context
 *       / cost capabilities, and
 *   (b) the models actually exposed by the gateway.
 *
 * Unknown-to-us models are registered with conservative defaults unless
 * they look like non-chat artifacts (embeddings, image-gen, TTS, ASR,
 * translation, rerank, OCR).
 *
 * Environment variables:
 *   AIL_API_KEY   — required. Authorization bearer sent to the gateway.
 *   AIL_BASE_URL  — optional. Defaults to http://localhost:18080/v1.
 *                   Point this at a remote gateway (e.g. a Tytus pod at
 *                   http://10.42.42.1:18080/v1) to share one extension.
 *
 * Usage:
 *   export AIL_API_KEY=sk-your-key
 *   pi --provider switchai --model claude-opus-4-6
 */

import type { AssistantMessageEventStream, Model } from "@mariozechner/pi-ai";
import { streamSimpleOpenAICompletions } from "@mariozechner/pi-ai";
import type { Context, ExtensionAPI, SimpleStreamOptions } from "@mariozechner/pi-coding-agent";

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_BASE_URL = "http://localhost:18080/v1";

function getBaseUrl(): string {
	const raw = process.env.AIL_BASE_URL?.trim() || DEFAULT_BASE_URL;
	const noTrailing = raw.replace(/\/+$/, "");
	return /\/v\d+$/.test(noTrailing) ? noTrailing : `${noTrailing}/v1`;
}

// Heuristic filter for non-chat models the gateway may expose.
// switchAILocal hosts embeddings, image gen, TTS, ASR, translation, rerank,
// and OCR models alongside chat completions. Calling them via the chat
// completions path fails at request time, so we exclude them from
// registration to keep pi's /model selector useful.
const NON_CHAT_PATTERN =
	/(embed|embedding|image-|image_|-image|dall|flux|ideogram|stable-diffusion|imagen|tts|text-to-speech|-speech|asr|-transcribe|whisper|cosyvoice|rerank|reranker|-mt-|-ocr|-vl-ocr|image-edit)/i;

function isLikelyChatModel(id: string): boolean {
	return !NON_CHAT_PATTERN.test(id);
}

// =============================================================================
// Curated metadata overlay
// =============================================================================

interface ModelMetadata {
	name: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	contextWindow: number;
	maxTokens: number;
}

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

// Keyed by exact gateway model ID. Add entries as switchAILocal's config.yaml
// grows; unknown chat models still register with DEFAULTS below.
const CURATED_METADATA: Record<string, ModelMetadata> = {
	// --- MiniMax ---
	"minimax:MiniMax-M2.7": {
		name: "MiniMax M2.7",
		reasoning: true,
		input: ["text"],
		cost: ZERO_COST,
		contextWindow: 1_000_000,
		maxTokens: 16_384,
	},
	"minimax-m2.5:cloud": {
		name: "MiniMax M2.5 (cloud)",
		reasoning: true,
		input: ["text"],
		cost: ZERO_COST,
		contextWindow: 1_000_000,
		maxTokens: 16_384,
	},

	// --- Anthropic ---
	"claude-opus-4-6": {
		name: "Claude Opus 4.6",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
		contextWindow: 1_000_000,
		maxTokens: 128_000,
	},
	"claude-sonnet-4-6": {
		name: "Claude Sonnet 4.6",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
		contextWindow: 1_000_000,
		maxTokens: 64_000,
	},
	"claude-haiku-4-5-20251001": {
		name: "Claude Haiku 4.5",
		reasoning: false,
		input: ["text", "image"],
		cost: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
		contextWindow: 200_000,
		maxTokens: 8_192,
	},
	"claude-opus-4-5-20251101": {
		name: "Claude Opus 4.5",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
		contextWindow: 200_000,
		maxTokens: 32_000,
	},
	"claude-sonnet-4-5-20250929": {
		name: "Claude Sonnet 4.5",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
		contextWindow: 200_000,
		maxTokens: 64_000,
	},

	// --- OpenAI ---
	"gpt-5.4": {
		name: "GPT-5.4",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 2.5, output: 10, cacheRead: 0.25, cacheWrite: 0 },
		contextWindow: 400_000,
		maxTokens: 64_000,
	},
	"gpt-5.2": {
		name: "GPT-5.2",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 2, output: 8, cacheRead: 0.2, cacheWrite: 0 },
		contextWindow: 400_000,
		maxTokens: 64_000,
	},
	"gpt-5-mini": {
		name: "GPT-5 Mini",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0.25, output: 2, cacheRead: 0.025, cacheWrite: 0 },
		contextWindow: 400_000,
		maxTokens: 64_000,
	},

	// --- Google ---
	"gemini-2.5-pro": {
		name: "Gemini 2.5 Pro",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 1.25, output: 10, cacheRead: 0.31, cacheWrite: 0 },
		contextWindow: 2_000_000,
		maxTokens: 8_192,
	},
	"gemini-2.5-flash": {
		name: "Gemini 2.5 Flash",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0.3, output: 2.5, cacheRead: 0.075, cacheWrite: 0 },
		contextWindow: 1_000_000,
		maxTokens: 8_192,
	},
	"gemini-2.5-flash-lite": {
		name: "Gemini 2.5 Flash Lite",
		reasoning: false,
		input: ["text", "image"],
		cost: { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0 },
		contextWindow: 1_000_000,
		maxTokens: 8_192,
	},

	// --- DeepSeek ---
	"deepseek-v3.2": {
		name: "DeepSeek v3.2",
		reasoning: true,
		input: ["text"],
		cost: ZERO_COST,
		contextWindow: 128_000,
		maxTokens: 8_192,
	},

	// --- Alibaba Qwen ---
	"qwen3-max": {
		name: "Qwen3 Max",
		reasoning: true,
		input: ["text"],
		cost: ZERO_COST,
		contextWindow: 128_000,
		maxTokens: 8_192,
	},
	"qwen-max-latest": {
		name: "Qwen Max (latest)",
		reasoning: false,
		input: ["text"],
		cost: ZERO_COST,
		contextWindow: 128_000,
		maxTokens: 8_192,
	},

	// --- Moonshot Kimi ---
	"kimi-k2.5:cloud": {
		name: "Kimi K2.5 (cloud)",
		reasoning: true,
		input: ["text"],
		cost: ZERO_COST,
		contextWindow: 256_000,
		maxTokens: 16_384,
	},

	// --- Zhipu GLM ---
	"glm-4.7:cloud": {
		name: "GLM 4.7 (cloud)",
		reasoning: true,
		input: ["text"],
		cost: ZERO_COST,
		contextWindow: 128_000,
		maxTokens: 8_192,
	},
	"glm-4.6:cloud": {
		name: "GLM 4.6 (cloud)",
		reasoning: false,
		input: ["text"],
		cost: ZERO_COST,
		contextWindow: 128_000,
		maxTokens: 8_192,
	},

	// --- Xiaomi MiMo (multimodal omni) ---
	"mimo-v2-omni": {
		name: "MiMo v2 Omni",
		reasoning: false,
		input: ["text", "image"],
		cost: ZERO_COST,
		contextWindow: 128_000,
		maxTokens: 8_192,
	},
};

// Conservative defaults for gateway models that pass isLikelyChatModel but
// have no curated metadata entry. Cost stays at 0 because we don't know —
// pi will display 0$ instead of misleading numbers.
const DEFAULT_METADATA: ModelMetadata = {
	name: "",
	reasoning: false,
	input: ["text"],
	cost: ZERO_COST,
	contextWindow: 128_000,
	maxTokens: 8_192,
};

// =============================================================================
// Gateway discovery
// =============================================================================

interface GatewayModel {
	id: string;
	object?: string;
	owned_by?: string;
	capabilities?: string[];
}

interface GatewayModelsResponse {
	data?: GatewayModel[];
}

async function fetchGatewayModels(baseUrl: string, apiKey: string): Promise<GatewayModel[] | null> {
	try {
		const response = await fetch(`${baseUrl}/models`, {
			headers: { Authorization: `Bearer ${apiKey}` },
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) {
			process.stderr.write(
				`[switchai] gateway at ${baseUrl} returned HTTP ${response.status} on /models — using curated list as fallback\n`,
			);
			return null;
		}
		const body = (await response.json()) as GatewayModelsResponse;
		return body.data ?? [];
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		process.stderr.write(
			`[switchai] could not reach gateway at ${baseUrl}: ${msg} — using curated list as fallback\n`,
		);
		return null;
	}
}

type ProviderModelConfig = {
	id: string;
	name: string;
	api: "openai-completions";
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	contextWindow: number;
	maxTokens: number;
	compat: { supportsDeveloperRole: false };
};

function toProviderModel(id: string, meta: ModelMetadata): ProviderModelConfig {
	return {
		id,
		name: meta.name || `${id} (via switchai)`,
		api: "openai-completions",
		reasoning: meta.reasoning,
		input: meta.input,
		cost: meta.cost,
		contextWindow: meta.contextWindow,
		maxTokens: meta.maxTokens,
		compat: { supportsDeveloperRole: false },
	};
}

interface BuildStats {
	curatedRegistered: number;
	discoveredRegistered: number;
	gatewayTotal: number;
	skipped: number;
}

function buildModelList(gatewayModels: GatewayModel[] | null): { models: ProviderModelConfig[]; stats: BuildStats } {
	// No gateway response: register everything in CURATED_METADATA blindly.
	// Better a working subset than a dead extension.
	if (gatewayModels === null) {
		const models = Object.entries(CURATED_METADATA).map(([id, meta]) => toProviderModel(id, meta));
		return {
			models,
			stats: { curatedRegistered: models.length, discoveredRegistered: 0, gatewayTotal: 0, skipped: 0 },
		};
	}

	const gatewayIds = new Set(gatewayModels.map((m) => m.id));
	const registered: ProviderModelConfig[] = [];
	let curatedRegistered = 0;
	let discoveredRegistered = 0;
	let skipped = 0;

	// Pass 1: curated models that exist in the gateway.
	for (const [id, meta] of Object.entries(CURATED_METADATA)) {
		if (gatewayIds.has(id)) {
			registered.push(toProviderModel(id, meta));
			curatedRegistered++;
		}
	}
	const registeredIds = new Set(registered.map((m) => m.id));

	// Pass 2: everything else the gateway exposes that looks chat-capable,
	// registered with defaults.
	for (const gwModel of gatewayModels) {
		if (registeredIds.has(gwModel.id)) continue;
		if (!isLikelyChatModel(gwModel.id)) {
			skipped++;
			continue;
		}
		registered.push(toProviderModel(gwModel.id, { ...DEFAULT_METADATA, name: `${gwModel.id} (via switchai)` }));
		discoveredRegistered++;
	}

	return {
		models: registered,
		stats: { curatedRegistered, discoveredRegistered, gatewayTotal: gatewayModels.length, skipped },
	};
}

// =============================================================================
// Extension entry point
// =============================================================================

export default async function (pi: ExtensionAPI): Promise<void> {
	const baseUrl = getBaseUrl();
	const apiKey = process.env.AIL_API_KEY ?? "";

	const gatewayModels = await fetchGatewayModels(baseUrl, apiKey);
	const { models, stats } = buildModelList(gatewayModels);

	if (gatewayModels !== null) {
		process.stderr.write(
			`[switchai] ${baseUrl} → ${stats.gatewayTotal} models on gateway · ` +
				`${stats.curatedRegistered} curated + ${stats.discoveredRegistered} with defaults registered ` +
				`(${stats.skipped} non-chat filtered)\n`,
		);
	}

	pi.registerProvider("switchai", {
		baseUrl,
		apiKey: "AIL_API_KEY",
		api: "openai-completions",
		streamSimple: (model: Model, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream => {
			return streamSimpleOpenAICompletions(model, context, options);
		},
		models,
	});

	pi.registerCommand("switchai-status", {
		description: "Show switchai gateway connectivity and registered model counts",
		handler: async (_args, ctx) => {
			try {
				const response = await fetch(`${baseUrl}/models`, {
					headers: { Authorization: `Bearer ${process.env.AIL_API_KEY || ""}` },
					signal: AbortSignal.timeout(5000),
				});
				if (!response.ok) {
					ctx.ui.notify(`switchai: ${baseUrl} returned HTTP ${response.status}`, "error");
					return;
				}
				const data = (await response.json()) as GatewayModelsResponse;
				const total = Array.isArray(data.data) ? data.data.length : 0;
				ctx.ui.notify(
					`switchai: ${baseUrl} · ${total} on gateway · ${stats.curatedRegistered} curated + ${stats.discoveredRegistered} defaults at startup`,
					"info",
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`switchai: unreachable at ${baseUrl} (${msg})`, "error");
			}
		},
	});
}
