/**
 * Unit tests for the pure functions in index.ts.
 * Run with: npx vitest
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getBaseUrl, getAllowlistPatterns, matchesAllowlist, buildModelList } from "./index.js";

// ---------------------------------------------------------------------------
// getBaseUrl
// ---------------------------------------------------------------------------

describe("getBaseUrl", () => {
	const ORIGINAL = process.env.AIL_BASE_URL;

	beforeEach(() => {
		delete process.env.AIL_BASE_URL;
	});
	afterEach(() => {
		process.env.AIL_BASE_URL = ORIGINAL;
	});

	it("returns the default when AIL_BASE_URL is unset", () => {
		expect(getBaseUrl()).toBe("http://localhost:18080/v1");
	});

	it("strips a trailing slash", () => {
		process.env.AIL_BASE_URL = "http://localhost:18080/";
		expect(getBaseUrl()).toBe("http://localhost:18080/v1");
	});

	it("strips multiple trailing slashes", () => {
		process.env.AIL_BASE_URL = "http://localhost:18080///";
		expect(getBaseUrl()).toBe("http://localhost:18080/v1");
	});

	it("appends /v1 when the path has no version suffix", () => {
		process.env.AIL_BASE_URL = "http://localhost:18080";
		expect(getBaseUrl()).toBe("http://localhost:18080/v1");
	});

	it("passes through a URL that already ends in /v1", () => {
		process.env.AIL_BASE_URL = "http://localhost:18080/v1";
		expect(getBaseUrl()).toBe("http://localhost:18080/v1");
	});

	it("passes through a URL that ends in /v2", () => {
		process.env.AIL_BASE_URL = "http://localhost:18080/v2";
		expect(getBaseUrl()).toBe("http://localhost:18080/v2");
	});

	it("passes through a remote Tytus pod URL without trailing slash", () => {
		process.env.AIL_BASE_URL = "http://10.42.42.1:18080";
		expect(getBaseUrl()).toBe("http://10.42.42.1:18080/v1");
	});

	it("trims whitespace", () => {
		process.env.AIL_BASE_URL = "  http://localhost:18080  ";
		expect(getBaseUrl()).toBe("http://localhost:18080/v1");
	});
});

// ---------------------------------------------------------------------------
// getAllowlistPatterns
// ---------------------------------------------------------------------------

describe("getAllowlistPatterns", () => {
	const ORIGINAL = process.env.AIL_MODELS;

	beforeEach(() => {
		delete process.env.AIL_MODELS;
	});
	afterEach(() => {
		process.env.AIL_MODELS = ORIGINAL;
	});

	it("returns an empty array when AIL_MODELS is unset", () => {
		expect(getAllowlistPatterns()).toEqual([]);
	});

	it("returns an empty array when AIL_MODELS is empty/whitespace", () => {
		process.env.AIL_MODELS = "   ";
		expect(getAllowlistPatterns()).toEqual([]);
	});

	it("parses a single pattern", () => {
		process.env.AIL_MODELS = "claude-*";
		const patterns = getAllowlistPatterns();
		expect(patterns).toHaveLength(1);
		expect(patterns[0].source).toBe("^claude-.*$");
	});

	it("parses multiple comma-separated patterns", () => {
		process.env.AIL_MODELS = "claude-*,gpt-5*,minimax:*";
		const patterns = getAllowlistPatterns();
		expect(patterns).toHaveLength(3);
	});

	it("escapes regex metacharacters that are not *", () => {
		process.env.AIL_MODELS = "model.5";
		const patterns = getAllowlistPatterns();
		// `.` must be escaped to `\.`
		expect(patterns[0].source).toBe("^model\\.5$");
	});

	it("handles patterns with dots, plus, question marks", () => {
		process.env.AIL_MODELS = "a+b?c*d";
		const patterns = getAllowlistPatterns();
		// `+`, `?`, `d` (non-metachar) are escaped; `*` → `.*`
		expect(patterns[0].source).toBe("^a\\+b\\?c.*d$");
	});

	it("trims whitespace around each pattern", () => {
		process.env.AIL_MODELS = "  claude-*  ,  gpt-5*  ";
		const patterns = getAllowlistPatterns();
		expect(patterns).toHaveLength(2);
		expect(patterns[0].source).toBe("^claude-.*$");
		expect(patterns[1].source).toBe("^gpt-5.*$");
	});
});

// ---------------------------------------------------------------------------
// matchesAllowlist
// ---------------------------------------------------------------------------

describe("matchesAllowlist", () => {
	it("returns true when patterns is empty (no filter)", () => {
		expect(matchesAllowlist("any-model-id", [])).toBe(true);
	});

	it("matches a model id against a single pattern", () => {
		const patterns = getAllowlistPatterns();
		// set up patterns inline for clarity
		const singlePattern = [/^claude-.*$/];
		expect(matchesAllowlist("claude-opus-4-6", singlePattern)).toBe(true);
		expect(matchesAllowlist("gpt-5.4", singlePattern)).toBe(false);
	});

	it("matches using glob wildcard semantics (.*)", () => {
		const patterns = [/^gpt-.*$/];
		expect(matchesAllowlist("gpt-5.4", patterns)).toBe(true);
		expect(matchesAllowlist("gpt-5-mini", patterns)).toBe(true);
		expect(matchesAllowlist("gpt-4o", patterns)).toBe(true); // starts with "gpt-", .* matches "4o";
	});

	it("is case-sensitive (no i flag)", () => {
		const patterns = [/^Claude-.*$/];
		expect(matchesAllowlist("Claude-opus-4-6", patterns)).toBe(true);
		expect(matchesAllowlist("claude-opus-4-6", patterns)).toBe(false);
	});

	it("matches namespace prefix (minimax:*)", () => {
		const patterns = [/^minimax:.*$/];
		expect(matchesAllowlist("minimax:MiniMax-M2.7", patterns)).toBe(true);
		expect(matchesAllowlist("minimax-m2.5:cloud", patterns)).toBe(false);
	});

	it("OR semantics: returns true if any pattern matches", () => {
		const patterns = [/^claude-.*$/, /^gpt-.*$/];
		expect(matchesAllowlist("claude-opus-4-6", patterns)).toBe(true);
		expect(matchesAllowlist("gpt-5.4", patterns)).toBe(true);
		expect(matchesAllowlist("gemini-2.5-pro", patterns)).toBe(false);
	});

	it("exact match pattern works", () => {
		const patterns = [/^minimax:MiniMax-M2\.7$/];
		expect(matchesAllowlist("minimax:MiniMax-M2.7", patterns)).toBe(true);
		expect(matchesAllowlist("minimax:MiniMax-M2.5", patterns)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// buildModelList — gateway unavailable (null) path
// ---------------------------------------------------------------------------

describe("buildModelList — gateway unavailable (null)", () => {
	it("registers all curated models when gateway is null and no allowlist", () => {
		const { models, stats } = buildModelList(null, []);
		// CURATED_METADATA has 20 entries
		expect(stats.curatedRegistered).toBe(20);
		expect(stats.discoveredRegistered).toBe(0);
		expect(stats.gatewayTotal).toBe(0);
		expect(stats.skipped).toBe(0);
		expect(stats.allowlistFiltered).toBe(0);
		expect(stats.allowlistActive).toBe(false);
		expect(models).toHaveLength(20);
	});

	it("applies allowlist filter to curated list when gateway is null", () => {
		const allowlist = [/^claude-.*$/];
		const { models, stats } = buildModelList(null, allowlist);
		// Only Claude models pass the allowlist
		const curatedClaides = models.filter((m) => m.id.startsWith("claude"));
		expect(curatedClaides.length).toBeGreaterThan(0);
		expect(stats.allowlistFiltered).toBeGreaterThan(0);
		expect(stats.allowlistActive).toBe(true);
	});

	it("stats reflect allowlistFiltered count correctly (total - registered)", () => {
		const allowlist = [/^claude-.*$/];
		const totalCurated = 20;
		const { stats } = buildModelList(null, allowlist);
		expect(stats.allowlistFiltered).toBe(totalCurated - stats.curatedRegistered);
	});
});

// ---------------------------------------------------------------------------
// buildModelList — gateway available path
// ---------------------------------------------------------------------------

describe("buildModelList — gateway available", () => {
	it("registers curated models present in gateway", () => {
		const gatewayModels = [
			{ id: "claude-opus-4-6" },
			{ id: "gpt-5.4" },
			// A curated model NOT in the gateway
			{ id: "unknown-model" },
		];
		const { models, stats } = buildModelList(gatewayModels, []);
		expect(stats.curatedRegistered).toBe(2); // only the two present ones
		expect(stats.discoveredRegistered).toBe(1); // unknown-model (chat-like)
		expect(stats.gatewayTotal).toBe(3);
	});

	it("skips non-chat models (embeddings, image-gen, TTS, ASR, etc.)", () => {
		const gatewayModels = [
			{ id: "claude-opus-4-6" },
			{ id: "text-embedding-3-large" }, // embed → skipped
			{ id: "dall-e-3" },                // dall → skipped
			{ id: "gpt-5.4" },
			{ id: "whisper-1" },               // whisper → skipped
			{ id: "cosyvoice-tts" },           // tts → skipped
			{ id: "rerank-v1" },              // rerank → skipped
		];
		const { models, stats } = buildModelList(gatewayModels, []);
		expect(stats.skipped).toBe(5); // ALL 5 match NON_CHAT_PATTERN (embed, dall, whisper, cosyvoice, rerank) (passes NON_CHAT_PATTERN);
		expect(models.map((m) => m.id)).toEqual(["claude-opus-4-6", "gpt-5.4"]);
	});

	it("applies allowlist filter to curated models", () => {
		const gatewayModels = [
			{ id: "claude-opus-4-6" },
			{ id: "gpt-5.4" },
			{ id: "gemini-2.5-pro" },
		];
		const allowlist = [/^claude-.*$/];
		const { models, stats } = buildModelList(gatewayModels, allowlist);
		expect(models.map((m) => m.id)).toEqual(["claude-opus-4-6"]);
		expect(stats.allowlistFiltered).toBe(4); // 2 curated + 2 discovered non-claude filtered;
	});

	it("applies allowlist filter to discovered models", () => {
		const gatewayModels = [
			{ id: "claude-opus-4-6" },
			{ id: "random-unknown-model" },
			{ id: "another-unknown" },
		];
		const allowlist = [/^claude-.*$/];
		const { models, stats } = buildModelList(gatewayModels, allowlist);
		// curated claude passes, but both unknown models fail the allowlist
		expect(models.map((m) => m.id)).toEqual(["claude-opus-4-6"]);
		expect(stats.allowlistFiltered).toBe(2);
	});

	it("does not register the same model twice (curated + discovered intersection)", () => {
		const gatewayModels = [
			{ id: "claude-opus-4-6" },
			{ id: "random-model" },
		];
		const { models } = buildModelList(gatewayModels, []);
		const ids = models.map((m) => m.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	it("uses curated metadata for known models (reasoning, cost, contextWindow)", () => {
		const gatewayModels = [{ id: "claude-opus-4-6" }, { id: "gpt-5.4" }];
		const { models } = buildModelList(gatewayModels, []);
		const byId = Object.fromEntries(models.map((m) => [m.id, m]));

		expect(byId["claude-opus-4-6"].reasoning).toBe(true);
		expect(byId["claude-opus-4-6"].contextWindow).toBe(1_000_000);
		expect(byId["claude-opus-4-6"].cost.input).toBe(5);

		expect(byId["gpt-5.4"].reasoning).toBe(true);
		expect(byId["gpt-5.4"].cost.input).toBe(2.5);
	});

	it("uses DEFAULT_METADATA for unknown discovered models (cost 0, context 128K)", () => {
		const gatewayModels = [{ id: "some-totally-new-model-xyz" }];
		const { models } = buildModelList(gatewayModels, []);
		const m = models[0];
		expect(m.id).toBe("some-totally-new-model-xyz");
		expect(m.cost.input).toBe(0);
		expect(m.cost.output).toBe(0);
		expect(m.contextWindow).toBe(128_000);
		expect(m.maxTokens).toBe(8_192);
		expect(m.reasoning).toBe(false);
		expect(m.name).toBe("some-totally-new-model-xyz (via switchai)");
	});

	it("marks all models as openai-completions api", () => {
		const gatewayModels = [{ id: "claude-opus-4-6" }, { id: "unknown-chat-model" }];
		const { models } = buildModelList(gatewayModels, []);
		for (const m of models) {
			expect(m.api).toBe("openai-completions");
		}
	});

	it("all models set supportsDeveloperRole: false", () => {
		const gatewayModels = [{ id: "claude-opus-4-6" }];
		const { models } = buildModelList(gatewayModels, []);
		expect(models[0].compat.supportsDeveloperRole).toBe(false);
	});
});
