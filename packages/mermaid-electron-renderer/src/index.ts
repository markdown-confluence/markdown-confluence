import { BrowserWindow } from "@electron/remote";
import { ChartData, MermaidRenderer } from "@markdown-confluence/lib";
import mermaid, { MermaidConfig } from "mermaid";
import { v4 as uuidv4 } from "uuid";

let mermaidRenderHtml: string;

const pluginMermaidConfig = {
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
	constructor(
		private extraStyleSheets: string[],
		private extraStyles: string[],
		private mermaidConfig: MermaidConfig = pluginMermaidConfig,
		private bodyClasses = "",
	) {}

	async captureMermaidCharts(
		charts: ChartData[],
	): Promise<Map<string, Buffer>> {
		if (!mermaidRenderHtml) {
			mermaidRenderHtml = URL.createObjectURL(
				this.getFileContentBlob(
					this.extraStyleSheets,
					this.extraStyles,
					this.bodyClasses,
				),
			);
		}

		const capturedCharts = new Map<string, Buffer>();

		const promises = charts.map(async (chart) => {
			const debug = false;

			const chartWindow = new BrowserWindow({
				width: 800,
				height: 600,
				show: debug,
				frame: debug,
			});

			if (debug) {
				chartWindow.webContents.openDevTools();
			}

			await chartWindow.loadURL(mermaidRenderHtml);

			const { themeVariables, ...mermaidInitConfig } = this.mermaidConfig;

			mermaid.initialize({ ...mermaidInitConfig, startOnLoad: false });

			if (themeVariables) {
				mermaid.mermaidAPI.updateSiteConfig({ themeVariables });
			}

			const id = "mm" + uuidv4().replace(/-/g, "");
			const { svg } = await mermaid.render(id, chart.data);

			// Render the chart and get the dimensions
			const dimensions = await chartWindow.webContents.executeJavaScript(
				`renderSvg(${JSON.stringify(svg)});`,
			);

			// Resize the window to fit the chart dimensions
			const { width, height } = dimensions;
			chartWindow.setSize(width, height);

			try {
				// Capture the chart as a NativeImage
				const image = await chartWindow.webContents.capturePage(
					dimensions,
					{ stayHidden: true, stayAwake: true },
				);
				// Convert the NativeImage to a PNG buffer
				const imageBuffer = image.toPNG();
				// Add the buffer to the capturedCharts map
				capturedCharts.set(chart.name, imageBuffer);
				// Resolve the promise
			} finally {
				if (!debug) {
					chartWindow.close();
				}
			}
		});

		await Promise.all(promises);
		return capturedCharts;
	}

	getFileContentBlob(
		extraStyleSheets: string[],
		extraStyles: string[],
		bodyClasses: string,
	): Blob {
		const styleSheetTags = extraStyleSheets
			.map(
				(url) =>
					`<link href="${url}" type="text/css" rel="stylesheet"/>`,
			)
			.join("\n");
		const extraStylesTag = `
		<style>
		${extraStyles.join("\n")}
		</style>`;

		const fileContents = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Mermaid Chart</title>
	${styleSheetTags}
	${extraStylesTag}
  </head>
  <body class="${bodyClasses}">
  	<div id="graphDiv"></div>
    <script type="text/javascript">
	window.renderSvg = (svg) => {
        const chartElement = document.querySelector("#graphDiv");
        chartElement.innerHTML = svg;
    
        const svgElement = document.querySelector("#graphDiv svg");
        return {
            width: svgElement.scrollWidth,
            height: svgElement.scrollHeight,
        };
    }
	</script>
  </body>
</html>
`;

		const bytes = new Uint8Array(fileContents.length);
		for (let i = 0; i < fileContents.length; i++) {
			bytes[i] = fileContents.charCodeAt(i);
		}
		return new Blob([bytes], { type: "text/html" });
	}
}
