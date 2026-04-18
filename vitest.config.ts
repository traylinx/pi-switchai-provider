import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["*.test.ts"],
		environment: "node",
		coverage: {
			include: ["index.ts"],
			exclude: ["*.test.ts"],
		},
	},
});
