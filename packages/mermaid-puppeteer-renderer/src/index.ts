import { ChartData, MermaidRenderer } from "@markdown-confluence/lib";
import path from "path";
import puppeteer from "puppeteer";
import url from "url";

export class PuppeteerMermaidRenderer implements MermaidRenderer {
	async captureMermaidCharts(
		charts: ChartData[]
	): Promise<Map<string, Buffer>> {
		const capturedCharts = new Map<string, Buffer>();

		//for (const chart of charts) {
		const promises = charts.map(async (chart) => {
			const browser = await puppeteer.launch({ headless: "new" });
			const page = await browser.newPage();
			try {
				const mermaidHTMLPath = path.join(
					__dirname,
					"..",
					"dist",
					"mermaid_renderer.html"
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
						return window.renderMermaidChart(
							mermaidData,
							mermaidConfig
						);
					},
					chart.data,
					mermaidConfig
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
