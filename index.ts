/**
 * switchai Provider Extension for pi
 *
 * Registers the switchai provider which routes through switchAILocal gateway.
 * Requires switchai to be running at localhost:18080 with configured models.
 *
 * Usage:
 *   export AIL_API_KEY=your-api-key
 *   pi --provider switchai --model minimax:MiniMax-M2.7
 *
 * To install this extension:
 *   pi install github:switchai-org/pi-switchai-provider
 *   # or
 *   pi install npm:@switchai/pi-provider
 */

import type { AssistantMessageEventStream, Model } from "@mariozechner/pi-ai";
import { streamSimpleOpenAICompletions } from "@mariozechner/pi-ai";
import type { Context, ExtensionAPI, SimpleStreamOptions } from "@mariozechner/pi-coding-agent";

const SWITCHAI_BASE_URL = "http://localhost:18080/v1";

interface SwitchaiModelConfig {
	id: string;
	name: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	contextWindow: number;
	maxTokens: number;
}

const SWITCHAI_MODELS: SwitchaiModelConfig[] = [
	{
		id: "minimax:MiniMax-M2.7",
		name: "MiniMax-M2.7 (via switchai)",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 16384,
	},
	{
		id: "minimax:MiniMax-M2",
		name: "MiniMax-M2 (via switchai)",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000000,
		maxTokens: 16384,
	},
	{
		id: "anthropic:claude-sonnet-4-6",
		name: "Claude Sonnet 4.6 (via switchai)",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
		contextWindow: 1000000,
		maxTokens: 64000,
	},
	{
		id: "anthropic:claude-opus-4-6",
		name: "Claude Opus 4.6 (via switchai)",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
		contextWindow: 1000000,
		maxTokens: 128000,
	},
	{
		id: "switchai:switchai-fast",
		name: "switchai-fast (via switchai)",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
	},
	{
		id: "switchai:switchai-reasoner",
		name: "switchai-reasoner (via switchai)",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
	},
];

export default function (pi: ExtensionAPI) {
	pi.registerProvider("switchai", {
		baseUrl: SWITCHAI_BASE_URL,
		apiKey: "AIL_API_KEY",
		api: "openai-completions",
		streamSimple: (model: Model, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream => {
			return streamSimpleOpenAICompletions(model, context, options);
		},
		models: SWITCHAI_MODELS.map((config) => ({
			id: config.id,
			name: config.name,
			api: "openai-completions",
			reasoning: config.reasoning,
			input: config.input,
			cost: config.cost,
			contextWindow: config.contextWindow,
			maxTokens: config.maxTokens,
			compat: {
				supportsDeveloperRole: false,
			},
		})),
	});

	pi.registerCommand("switchai-status", {
		description: "Show switchai connection status",
		handler: async (_args, ctx) => {
			try {
				const response = await fetch(`${SWITCHAI_BASE_URL}/models`, {
					headers: {
						Authorization: `Bearer ${process.env.AIL_API_KEY || ""}`,
					},
				});
				if (response.ok) {
					const data = await response.json();
					const modelCount = Array.isArray(data.data) ? data.data.length : 0;
					ctx.ui.notify(`switchai: Connected (${modelCount} models available)`, "info");
				} else {
					ctx.ui.notify(`switchai: Connection failed (${response.status})`, "error");
				}
			} catch {
				ctx.ui.notify(`switchai: Not reachable - is switchAILocal running?`, "error");
			}
		},
	});
}
