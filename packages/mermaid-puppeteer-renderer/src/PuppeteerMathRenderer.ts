import puppeteer from "puppeteer";
import { downloadBrowsers } from "puppeteer/lib/puppeteer/node/install.js";
import {
	mathImageHtml,
	rasterizeMathImage,
	type MathExpression,
	type MathRenderer,
} from "@markdown-confluence/lib";

export class PuppeteerMathRenderer implements MathRenderer {
	async captureMath(expressions: MathExpression[]): Promise<Map<string, Buffer>> {
		const images = new Map<string, Buffer>();
		if (!expressions.length) return images;
		await downloadBrowsers();
		const browser = await puppeteer.launch({
			headless: true,
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		});
		try {
			const page = await browser.newPage();
			await page.setJavaScriptEnabled(false);
			await page.setViewport({ width: 2048, height: 1024, deviceScaleFactor: 2 });
			for (const expression of expressions) {
				await page.setContent(mathImageHtml(expression));
				const png = await page.evaluate(rasterizeMathImage);
				images.set(expression.name, Buffer.from(png.split(",")[1]!, "base64"));
			}
		} finally {
			await browser.close();
		}
		return images;
	}
}
