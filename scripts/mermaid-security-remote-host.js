import { ElectronMermaidRenderer } from "../packages/mermaid-electron-renderer/src/index";
import { verifyMermaidResourcePolicy } from "./mermaid-security-checks";

export async function runRemoteHostChecks(fileUrl) {
	return verifyMermaidResourcePolicy(
		(options) =>
			new ElectronMermaidRenderer(
				[],
				["/* 中文 café */ body { font-family: sans-serif; }"],
				{},
				`theme-${options.theme === "dark" ? "dark" : "light"}`,
				options,
			),
		fileUrl,
	);
}
