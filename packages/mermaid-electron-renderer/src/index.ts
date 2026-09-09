import { validateMermaidOptions, type MermaidOptions } from "@markdown-confluence/lib";
import { BrowserWindow, session } from "@electron/remote";
import { ChartData, MermaidRenderer } from "@markdown-confluence/lib";
import type { MermaidConfig } from "mermaid";
import { isolatedMermaidRuntime } from "./mermaidRuntime";
import { v4 as uuidv4 } from "uuid";
import { sanitizeMermaidConfig } from "./mermaidConfig";

const pluginMermaidConfig: MermaidConfig = {
	theme: "base",
	themeVariables: {
		background: "#ffffff",
		mainBkg: "#ddebff",
		primaryColor: "#ddebff",
		primaryTextColor: "#192b50",
		primaryBorderColor: "#0052cc",
		secondaryColor: "#ff8f73",
		secondaryTextColor: "#192b50",
		secondaryBorderColor: "#df360c",
		tertiaryColor: "#c0b6f3",
		tertiaryTextColor: "#fefefe",
		tertiaryBorderColor: "#5243aa",
		noteBkgColor: "#ffc403",
		noteTextColor: "#182a4e",
		textColor: "#ff0000",
		titleColor: "#0052cc",
	},
};

export class ElectronMermaidRenderer implements MermaidRenderer {
	readonly format: "png" | "svg";
	constructor(
		private extraStyleSheets: string[],
		private extraStyles: string[],
		private mermaidConfig: MermaidConfig = pluginMermaidConfig,
		private bodyClasses = "",
		private renderOptions: MermaidOptions = {},
	) {
		validateMermaidOptions(renderOptions);
		this.format = renderOptions.format ?? "png";
	}

	async captureMermaidCharts(charts: ChartData[]): Promise<Map<string, Buffer>> {
		const capturedCharts = new Map<string, Buffer>();
		if (charts.length === 0) return capturedCharts;
		const documentHtml = await this.getFileContentBlob(
			this.extraStyleSheets,
			this.extraStyles,
			this.bodyClasses,
		).text();
		const documentUrl = `data:text/html;charset=utf-8,${encodeURIComponent(documentHtml)}`;
		// This session is private to this capture and never touches Obsidian's
		// session, permissions, cookies, CSP or global request handlers.
		const renderSession = session.fromPartition(`mermaid-${uuidv4()}`, { cache: false });
		renderSession.webRequest.onBeforeRequest((details, callback) => {
			callback({
				cancel: details.url !== documentUrl || details.resourceType !== "mainFrame",
			});
		});
		renderSession.setPermissionRequestHandler((_contents, _permission, callback) =>
			callback(false),
		);
		renderSession.setPermissionCheckHandler(() => false);
		try {
			const config = sanitizeMermaidConfig({
				...this.mermaidConfig,
				...(this.renderOptions.theme ? { theme: this.renderOptions.theme } : {}),
				themeVariables: {
					...this.mermaidConfig.themeVariables,
					...this.renderOptions.themeVariables,
				},
				securityLevel: "strict",
			});
			for (const chart of charts) {
				const chartWindow = new BrowserWindow({
					width: 800,
					height: 600,
					show: false,
					frame: false,
					webPreferences: {
						session: renderSession,
						nodeIntegration: false,
						contextIsolation: true,
						sandbox: true,
						webSecurity: true,
						allowRunningInsecureContent: false,
						backgroundThrottling: false,
						spellcheck: false,
					},
				});
				try {
					chartWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
					chartWindow.webContents.on("will-navigate", (event) => event.preventDefault());
					chartWindow.webContents.on("will-redirect", (event) => event.preventDefault());
					await chartWindow.loadURL(documentUrl);
					// Mermaid and its diagram source run only after the sandbox,
					// resource policy and CSP are active, including SVG-only output.
					await chartWindow.webContents.executeJavaScript(isolatedMermaidRuntime());
					const result: { width: number; height: number; svg: string } =
						await chartWindow.webContents.executeJavaScript(
							`window.renderMermaidChart(${JSON.stringify(chart.data)}, ${JSON.stringify(config)})`,
						);
					if (this.format === "svg") {
						capturedCharts.set(chart.name, Buffer.from(result.svg));
						continue;
					}
					const scale = this.renderOptions.scale ?? 1;
					await chartWindow.webContents.setZoomFactor(scale);
					const dimensions = {
						x: 0,
						y: 0,
						width: Math.ceil(result.width * scale),
						height: Math.ceil(result.height * scale),
					};
					chartWindow.setSize(dimensions.width, dimensions.height);
					const capturedImage = await chartWindow.webContents.capturePage(dimensions, {
						stayHidden: true,
						stayAwake: true,
					});
					capturedCharts.set(chart.name, capturedImage.toPNG());
				} finally {
					chartWindow.close();
				}
			}
			return capturedCharts;
		} finally {
			await renderSession.closeAllConnections();
			await renderSession.clearStorageData();
			renderSession.webRequest.onBeforeRequest(null);
		}
	}

	getFileContentBlob(
		extraStyleSheets: string[],
		extraStyles: string[],
		bodyClasses: string,
	): Blob {
		if (extraStyleSheets.length) {
			throw new Error(
				"External Mermaid stylesheets are disabled; supply trusted inline CSS instead",
			);
		}
		const safeClasses = bodyClasses.replace(
			/[&<>"']/gu,
			(character) =>
				({
					"&": "&amp;",
					"<": "&lt;",
					">": "&gt;",
					'"': "&quot;",
					"'": "&#39;",
				})[character]!,
		);
		const inlineStyles = extraStyles.join("\n").replace(/</gu, "\\3c ");
		const fileContents = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'" />
    <title>Mermaid Chart</title>
    <style>${inlineStyles}</style>
  </head>
  <body class="${safeClasses}">
    <div id="graphDiv"></div>
  </body>
</html>`;
		return new Blob([fileContents], { type: "text/html" });
	}
}

import { ElectronMathRenderer } from "./ElectronMathRenderer";

export { ElectronMathRenderer };
