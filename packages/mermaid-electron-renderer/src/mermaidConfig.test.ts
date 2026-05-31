import { expect, test } from "@effect/vitest";
import { MermaidConfig } from "mermaid";
import { sanitizeMermaidConfig } from "./mermaidConfig";

test("removes Obsidian CSS color variables from Mermaid theme variables", () => {
	const config = {
		theme: "base",
		themeVariables: {
			fontFamily: "var(--font-text)",
			primaryColor: "var(--background-primary)",
			primaryTextColor: "#ffffff",
			secondaryColor: "color-mix(in srgb, red 50%, blue)",
		},
	} satisfies MermaidConfig;

	const sanitizedConfig = sanitizeMermaidConfig(config);

	expect(sanitizedConfig.themeVariables).toEqual({
		fontFamily: "var(--font-text)",
		primaryTextColor: "#ffffff",
	});
	expect(config.themeVariables).toHaveProperty("primaryColor");
});

test("removes empty theme variables after sanitizing unsupported values", () => {
	const sanitizedConfig = sanitizeMermaidConfig({
		theme: "base",
		themeVariables: {
			primaryColor: "light-dark(#ffffff, #000000)",
		},
	});

	expect("themeVariables" in sanitizedConfig).toBe(false);
});
