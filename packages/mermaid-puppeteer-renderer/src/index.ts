import { ChartData, MermaidRenderer } from "@markdown-confluence/lib";
import path from "path";
import puppeteer, { PuppeteerLaunchOptions } from "puppeteer";
import { downloadBrowser } from "puppeteer/lib/esm/puppeteer/node/install.js";
import url from "url";

interface RemoteWindowedCustomFunctions {
	renderMermaidChart: (
		mermaidData: string,
		mermaidConfig: unknown,
	) => Promise<{ width: number; height: number }>;
}

export class PuppeteerMermaidRenderer implements MermaidRenderer {
	async captureMermaidCharts(
		charts: ChartData[],
	): Promise<Map<string, Buffer>> {
		const capturedCharts = new Map<string, Buffer>();

		await downloadBrowser();
		//for (const chart of charts) {
		const promises = charts.map(async (chart) => {
			const puppeteerLaunchConfig = {
				executablePath: puppeteer.executablePath(),
				headless: "new",
				args: [
					"--ignore-certificate-errors",
					"--no-sandbox",
					"--disable-setuid-sandbox",
					"--disable-accelerated-2d-canvas",
					"--disable-gpu",
				],
			} satisfies PuppeteerLaunchOptions;

			console.log(
				"LAUNCHING CHROME",
				JSON.stringify(puppeteerLaunchConfig),
			);
			const browser = await puppeteer.launch(puppeteerLaunchConfig);

			const page = await browser.newPage();
			try {
				const mermaidHTMLPath = path.join(
					__dirname,
					"mermaid_renderer.html",
				);
				const pathToLoad = url.pathToFileURL(mermaidHTMLPath).href;

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
					mermaidConfig,
				);
				await page.setViewport({
					width: result.width,
					height: result.height,
				});
				const imageBuffer = await page.screenshot();
				capturedCharts.set(chart.name, imageBuffer);
			} finally {
				await page.close();
				await browser.close();
			}
		});

		await Promise.all(promises);

		return capturedCharts;
	}
}
