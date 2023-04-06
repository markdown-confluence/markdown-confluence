import * as path from "path";
import { BrowserWindow } from "@electron/remote";
import { ChartData, MermaidRenderer } from "./types";
import MermaidRendererClient from "mermaid_renderer.esbuild";

const mermaid_render_html = URL.createObjectURL(
	new Blob([MermaidRendererClient], { type: "text/html" })
);

export class ElectronMermaidRenderer implements MermaidRenderer {
	async captureMermaidCharts(
		charts: ChartData[]
	): Promise<Map<string, Buffer>> {
		const capturedCharts = new Map<string, Buffer>();

		const promises = charts.map(async (chart) => {
			return new Promise<void>(async (resolve, reject) => {
				// Create a new BrowserWindow instance
				const chartWindow = new BrowserWindow({
					width: 800,
					height: 600,
					show: false,
					frame: false,
				});

				console.log({ mermaid_render_html });
				await chartWindow.loadURL(mermaid_render_html);

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

				// Render the chart and get the dimensions
				const dimensions = await chartWindow.webContents
					.executeJavaScript(`
			  renderMermaidChart(\`${chart.data}\`, ${JSON.stringify(mermaidConfig)});
			`);

				// Resize the window to fit the chart dimensions
				const { x, y, width, height } = dimensions;
				chartWindow.setSize(width, height);

				try {
					// Capture the chart as a NativeImage
					const image = await chartWindow.webContents.capturePage(
						dimensions,
						{ stayHidden: true, stayAwake: true }
					);
					// Convert the NativeImage to a PNG buffer
					const imageBuffer = image.toPNG();
					// Clean up the window
					chartWindow.close();
					// Add the buffer to the capturedCharts map
					capturedCharts.set(chart.name, imageBuffer);
					// Resolve the promise
					resolve();
				} catch (error) {
					// Handle errors and clean up
					chartWindow.close();
					reject(error);
				}
			});
		});

		await Promise.all(promises);
		return capturedCharts;
	}
}
