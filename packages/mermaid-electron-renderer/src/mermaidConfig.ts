import { MermaidConfig } from "mermaid";

const unsupportedCssColorFunctionPattern = /\b(?:color-mix|light-dark|var)\(/iu;
const fontThemeVariablePattern = /^font/iu;

export function sanitizeMermaidConfig(mermaidConfig: MermaidConfig): MermaidConfig {
	const sanitizedConfig = { ...mermaidConfig };
	const themeVariables = sanitizeThemeVariables(mermaidConfig.themeVariables);

	delete sanitizedConfig.themeVariables;
	if (themeVariables) {
		sanitizedConfig.themeVariables = themeVariables;
	}

	return sanitizedConfig;
}

function sanitizeThemeVariables(
	themeVariables: MermaidConfig["themeVariables"],
): MermaidConfig["themeVariables"] | undefined {
	if (!themeVariables) {
		return undefined;
	}

	const sanitizedThemeVariables: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(themeVariables as Record<string, unknown>)) {
		if (isUnsupportedCssColorToken(name, value)) {
			continue;
		}

		sanitizedThemeVariables[name] = value;
	}

	if (Object.keys(sanitizedThemeVariables).length === 0) {
		return undefined;
	}

	return sanitizedThemeVariables as MermaidConfig["themeVariables"];
}

function isUnsupportedCssColorToken(name: string, value: unknown): boolean {
	return (
		typeof value === "string" &&
		!fontThemeVariablePattern.test(name) &&
		unsupportedCssColorFunctionPattern.test(value)
	);
}
