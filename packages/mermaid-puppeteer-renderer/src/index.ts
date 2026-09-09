import { validateMermaidOptions, type MermaidOptions } from "@markdown-confluence/lib";
import { ChartData, MermaidRenderer, ConfluenceUploadSettings } from "@markdown-confluence/lib";
import puppeteer, { LaunchOptions } from "puppeteer";
import { downloadBrowsers } from "puppeteer/lib/puppeteer/node/install.js";

interface RemoteWindowedCustomFunctions {
	renderMermaidChart: (
		mermaidData: string,
		mermaidConfig: unknown,
	) => Promise<{ width: number; height: number; svg: string }>;
}

export class PuppeteerMermaidRenderer implements MermaidRenderer {
	private readonly protocolTimeout: number;

	readonly format: "png" | "svg";
	constructor(
		options: Pick<LaunchOptions, "protocolTimeout"> = {},
		private renderOptions: MermaidOptions = {},
	) {
		validateMermaidOptions(renderOptions);
		this.format = renderOptions.format ?? "png";
		this.protocolTimeout =
			options.protocolTimeout ??
			ConfluenceUploadSettings.DEFAULT_SETTINGS.mermaidProtocolTimeout;
		if (
			!Number.isSafeInteger(this.protocolTimeout) ||
			this.protocolTimeout <= 0 ||
			this.protocolTimeout > 2_147_483_647
		) {
			throw new Error(
				"Mermaid protocol timeout must be a positive integer in milliseconds (maximum 2147483647)",
			);
		}
	}

	async captureMermaidCharts(charts: ChartData[]): Promise<Map<string, Buffer>> {
		const capturedCharts = new Map<string, Buffer>();

		if (charts.length === 0) return capturedCharts;
		await downloadBrowsers();
		const executablePath = await puppeteer.executablePath();
		const puppeteerLaunchConfig = {
			executablePath,
			headless: true,
			protocolTimeout: this.protocolTimeout,
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--disable-accelerated-2d-canvas",
				"--disable-gpu",
			],
		} satisfies LaunchOptions;

		const browser = await puppeteer.launch(puppeteerLaunchConfig);

		try {
			for (const chart of charts) {
				const page = await browser.newPage();
				try {
					const pathToLoad = new URL(
						/* @vite-ignore */
						"mermaid_renderer.html",
						import.meta.url,
					).href;
					let initialDocumentPending = true;
					let blockedResourceRequest = false;
					await page.setRequestInterception(true);
					page.on("request", (request) => {
						const allowRendererDocument =
							initialDocumentPending &&
							request.url() === pathToLoad &&
							request.isNavigationRequest() &&
							request.resourceType() === "document" &&
							request.frame() === page.mainFrame();
						if (allowRendererDocument) initialDocumentPending = false;
						else blockedResourceRequest = true;
						// A page can close while an intercepted request is being resolved.
						void (
							allowRendererDocument
								? request.continue()
								: request.abort("blockedbyclient")
						).catch(() => undefined);
					});
					await page.evaluateOnNewDocument(() => {
						Object.defineProperty(window, "open", {
							value: () => null,
							writable: false,
							configurable: false,
						});
					});
					page.on("popup", (popup) => {
						if (popup) void popup.close().catch(() => undefined);
					});

					await page.goto(pathToLoad);

					const mermaidConfig = {
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

					const result = await page.evaluate(
						(mermaidData, mermaidConfig) => {
							const { renderMermaidChart } =
								globalThis as unknown as RemoteWindowedCustomFunctions;

							return renderMermaidChart(mermaidData, mermaidConfig);
						},
						chart.data,
						{
							...mermaidConfig,
							...(this.renderOptions.theme
								? { theme: this.renderOptions.theme }
								: {}),
							themeVariables: {
								...mermaidConfig.themeVariables,
								...this.renderOptions.themeVariables,
							},
							securityLevel: "strict",
						},
					);
					if (blockedResourceRequest) {
						throw new Error("Mermaid rendering attempted to load a blocked resource");
					}
					await page.setViewport({
						width: result.width,
						height: result.height,
						deviceScaleFactor: this.renderOptions.scale ?? 1,
					});
					const imageBuffer =
						this.format === "svg"
							? Buffer.from(result.svg)
							: Buffer.from(await page.screenshot());
					capturedCharts.set(chart.name, imageBuffer);
				} finally {
					await page.close();
				}
			}
		} finally {
			await browser.close();
		}

		return capturedCharts;
	}
}

import { PuppeteerMathRenderer } from "./PuppeteerMathRenderer";

export { PuppeteerMathRenderer };
