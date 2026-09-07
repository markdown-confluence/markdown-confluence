import { BrowserWindow } from "@electron/remote";
import {
	mathImageHtml,
	rasterizeMathImage,
	type MathExpression,
	type MathRenderer,
} from "@markdown-confluence/lib";

export class ElectronMathRenderer implements MathRenderer {
	async captureMath(expressions: MathExpression[]): Promise<Map<string, Buffer>> {
		const images = new Map<string, Buffer>();
		if (!expressions.length) return images;
		const window = new BrowserWindow({
			width: 2048,
			height: 1024,
			show: false,
			frame: false,
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
				backgroundThrottling: false,
			},
		});
		try {
			for (const expression of expressions) {
				await window.loadURL(
					`data:text/html;charset=utf-8,${encodeURIComponent(mathImageHtml(expression))}`,
				);
				const png: string = await window.webContents.executeJavaScript(
					`(${rasterizeMathImage.toString()})()`,
				);
				images.set(expression.name, Buffer.from(png.split(",")[1]!, "base64"));
			}
		} finally {
			window.close();
		}
		return images;
	}
}
