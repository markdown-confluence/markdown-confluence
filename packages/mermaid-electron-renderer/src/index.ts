import { BrowserWindow } from "@electron/remote";
import { ChartData, MermaidRenderer } from "@markdown-confluence/lib";
import MermaidRendererClient from "mermaid_renderer.esbuild";

const mermaidRenderHtml = URL.createObjectURL(
	new Blob([MermaidRendererClient], { type: "text/html" })
);

export class ElectronMermaidRenderer implements MermaidRenderer {
	async captureMermaidCharts(
		charts: ChartData[]
	): Promise<Map<string, Buffer>> {
		const capturedCharts = new Map<string, Buffer>();

		const promises = charts.map(async (chart) => {
			const chartWindow = new BrowserWindow({
				width: 800,
				height: 600,
				show: true,
				frame: true,
			});

			chartWindow.webContents.openDevTools();

			await chartWindow.loadURL(mermaidRenderHtml);

			let mermaidConfig = {
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

			// @ts-ignore
			mermaidConfig = window.mermaid.mermaidAPI.getConfig();

			// Render the chart and get the dimensions
			const dimensions = await chartWindow.webContents.executeJavaScript(`
			renderMermaidChart(\`${chart.data}\`, ${JSON.stringify(mermaidConfig)});
		`);

			// Resize the window to fit the chart dimensions
			const { width, height } = dimensions;
			chartWindow.setSize(width, height);

			try {
				// Capture the chart as a NativeImage
				const image = await chartWindow.webContents.capturePage(
					dimensions,
					{ stayHidden: true, stayAwake: true }
				);
				// Convert the NativeImage to a PNG buffer
				const imageBuffer = image.toPNG();
				// Add the buffer to the capturedCharts map
				capturedCharts.set(chart.name, imageBuffer);
				// Resolve the promise
			} finally {
				// chartWindow.close();
			}
		});

		await Promise.all(promises);
		return capturedCharts;
	}
}
