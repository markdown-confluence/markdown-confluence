import { validateMermaidOptions, type MermaidOptions } from "@markdown-confluence/lib";
import { BrowserWindow } from "@electron/remote";
import { ChartData, MermaidRenderer } from "@markdown-confluence/lib";
import mermaid, { MermaidConfig } from "mermaid";
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
		const mermaidRenderHtml = URL.createObjectURL(
			this.getFileContentBlob(this.extraStyleSheets, this.extraStyles, this.bodyClasses),
		);
		const capturedCharts = new Map<string, Buffer>();
		try {
			const { themeVariables, ...mermaidInitConfig } = sanitizeMermaidConfig({
				...this.mermaidConfig,
				...(this.renderOptions.theme ? { theme: this.renderOptions.theme } : {}),
				themeVariables: {
					...this.mermaidConfig.themeVariables,
					...this.renderOptions.themeVariables,
				},
				securityLevel: "strict",
			});
			mermaid.initialize({
				...mermaidInitConfig,
				startOnLoad: false,
				suppressErrorRendering: true,
			});
			if (themeVariables) mermaid.mermaidAPI.updateSiteConfig({ themeVariables });

			for (const chart of charts) {
				const chartWindow = new BrowserWindow({
					width: 800,
					height: 600,
					show: false,
					frame: false,
				});
				try {
					await chartWindow.loadURL(mermaidRenderHtml);
					const id = "mm" + uuidv4().replace(/-/g, "");
					const { svg } = await mermaid.render(id, chart.data);
					if (this.format === "svg") {
						capturedCharts.set(chart.name, Buffer.from(svg));
						continue;
					}
					const scale = this.renderOptions.scale ?? 1;
					await chartWindow.webContents.setZoomFactor(scale);
					const dimensions = await chartWindow.webContents.executeJavaScript(
						`renderSvg(${JSON.stringify(svg)});`,
					);
					dimensions.width = Math.ceil(dimensions.width * scale);
					dimensions.height = Math.ceil(dimensions.height * scale);
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
			URL.revokeObjectURL(mermaidRenderHtml);
		}
	}

	getFileContentBlob(
		extraStyleSheets: string[],
		extraStyles: string[],
		bodyClasses: string,
	): Blob {
		const styleSheetTags = extraStyleSheets
			.map((url) => `<link href="${url}" type="text/css" rel="stylesheet"/>`)
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

		return new Blob([fileContents], { type: "text/html" });
	}
}

import { ElectronMathRenderer } from "./ElectronMathRenderer";

export { ElectronMathRenderer };
