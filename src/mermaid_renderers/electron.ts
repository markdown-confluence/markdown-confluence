import * as path from "path";
import { BrowserWindow } from "@electron/remote";
import { ChartData, MermaidRenderer } from "./types";

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
					//			  webPreferences: {
					//				nodeIntegration: true,
					//				contextIsolation: false,
					//			  },
				});

				// Load the HTML file with the Mermaid.js chart
				await chartWindow.loadFile(
					path.join(
						"/Users/andrewmcclenaghan/dev/obsidian-confluence/obsidian-confluence/dev-vault/.obsidian/plugins/obsidian-confluence",
						"mermaid_renderer.html"
					)
				);

				// Render the chart and get the dimensions
				const dimensions = await chartWindow.webContents
					.executeJavaScript(`
			  renderMermaidChart(\`${chart.data}\`);
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
