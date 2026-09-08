export interface MermaidOptions {
	format?: "png" | "svg";
	scale?: number;
	theme?: "default" | "neutral" | "dark" | "forest" | "base";
	themeVariables?: Record<string, string>;
}
export function validateMermaidOptions(options: MermaidOptions = {}): MermaidOptions {
	if (options.format && !["png", "svg"].includes(options.format))
		throw new Error("Mermaid format must be png or svg");
	if (
		options.scale !== undefined &&
		(!Number.isFinite(options.scale) || options.scale < 1 || options.scale > 4)
	)
		throw new Error("Mermaid scale must be between 1 and 4");
	if (options.theme && !["default", "neutral", "dark", "forest", "base"].includes(options.theme))
		throw new Error("Unknown Mermaid theme");
	if (
		options.themeVariables &&
		Object.values(options.themeVariables).some((value) => typeof value !== "string")
	)
		throw new Error("Mermaid theme variables must be strings");
	return options;
}
