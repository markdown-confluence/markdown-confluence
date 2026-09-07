import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import { MathJaxTexFont } from "@mathjax/mathjax-tex-font/js/svg.js";
import "@mathjax/src/js/input/tex/base/BaseConfiguration.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js";

export interface MathExpression {
	name: string;
	source: string;
	display: boolean;
}
export interface MathRenderer {
	captureMath(expressions: MathExpression[]): Promise<Map<string, Buffer>>;
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

/** Fully local, path-based SVG: no font downloads, HTML, URLs or TeX file access. */
export function renderMathSvg(expression: Pick<MathExpression, "source" | "display">): string {
	if (!expression.source.trim() || expression.source.length > 16384)
		throw new Error("Math expression must contain 1–16384 characters");
	// A fresh input jax isolates user macros and equation numbering between expressions.
	const tex = new TeX({
		packages: ["base", "ams", "newcommand"],
		maxBuffer: 16384,
		maxMacros: 1000,
		formatError: (_jax: unknown, error: Error) => {
			throw new Error(`Invalid LaTeX: ${error.message}`);
		},
	});
	const document = mathjax.document("", {
		InputJax: tex,
		OutputJax: new SVG({
			fontCache: "none",
			fontData: MathJaxTexFont,
			linebreaks: { inline: false },
		}),
	});
	const result = document.convert(expression.source, {
		display: expression.display,
		em: 16,
		ex: 8,
		containerWidth: 1024,
	});
	return adaptor.innerHTML(result);
}

/** Rasterizers load only this generated document, with network/script access disabled. */
export function mathImageHtml(expression: Pick<MathExpression, "source" | "display">): string {
	return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>html,body{margin:0;background:white;color:black}body{font-size:16px}#math{display:inline-block;padding:2px}svg{vertical-align:middle}</style></head><body><div id="math">${renderMathSvg(expression)}</div></body></html>`;
}

/** Runs in an isolated browser page. Canvas avoids compositor-dependent screenshot bytes. */
export async function rasterizeMathImage(): Promise<string> {
	const svg = document.querySelector("#math svg");
	if (!svg) throw new Error("Math renderer produced no SVG");
	const bounds = svg.getBoundingClientRect();
	const width = Math.ceil(bounds.width) + 4;
	const height = Math.ceil(bounds.height) + 4;
	if (width < 1 || height < 1 || width > 4096 || height > 4096)
		throw new Error("Rendered equation exceeds the 4096 pixel size limit");
	svg.setAttribute("width", String(bounds.width));
	svg.setAttribute("height", String(bounds.height));
	svg.setAttribute("color", "black");
	const image = new Image();
	image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
	await image.decode();
	const canvas = document.createElement("canvas");
	canvas.width = width * 2;
	canvas.height = height * 2;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Math renderer could not create a canvas");
	context.fillStyle = "white";
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.drawImage(image, 4, 4, bounds.width * 2, bounds.height * 2);
	return canvas.toDataURL("image/png");
}
