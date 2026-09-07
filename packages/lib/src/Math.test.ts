import { describe, expect, it, vi } from "@effect/vitest";
import { filter } from "@atlaskit/adf-utils/traverse";
import { convertADFToMarkdown } from "./AdfConversion";
import { parseMarkdownToADF } from "./MdToADF";
import { renderMathSvg } from "./MathRenderer";
import { MathRendererPlugin, readMathExpression } from "./ADFProcessingPlugins/MathRendererPlugin";
import { executeADFProcessingPipeline } from "./ADFProcessingPlugins/types";
import type { PublisherFunctions } from "./ADFProcessingPlugins/types";

const parse = (source: string) => parseMarkdownToADF(source, "https://example.atlassian.net");
const expressions = (source: string) =>
	filter(parse(source), (node) => !!readMathExpression(node)).map(
		(node) => readMathExpression(node)!,
	);

describe("math parsing", () => {
	it("keeps TeX intact and distinguishes inline/display layout", () => {
		const result = expressions(String.raw`Before $x_i^2 + \frac{1}{2}$ after.

$$
\begin{pmatrix}1 & 2 \\ 3 & 4\end{pmatrix}
$$`);
		expect(result.map((item) => [item.source, item.display])).toEqual([
			[String.raw`x_i^2 + \frac{1}{2}`, false],
			[String.raw`\begin{pmatrix}1 & 2 \\ 3 & 4\end{pmatrix}`, true],
		]);
	});
	it("leaves currency, escaped dollars and code unchanged", () => {
		for (const source of [
			"Cost $5 and $10.",
			"\\$x$",
			"`$x$`",
			"```tex\n$x$\n```",
			"    $x$",
			"Unclosed $x",
		])
			expect(expressions(source)).toEqual([]);
	});
	it("strips Markdown containers from multiline display math", () => {
		expect(expressions("> $$\n> x+1\n> $$")[0]!.source).toBe("x+1");
		expect(expressions("- $$\n  x+1\n  $$")[0]!.source).toBe("x+1");
	});
	it("supports lists, tables and escaped dollar signs in equations", () => {
		expect(
			expressions("- $x$\n\n| Value |\n| --- |\n| $y$ |\n\n$\\text{\\$5}$").map(
				(item) => item.source,
			),
		).toEqual(["x", "y", String.raw`\text{\$5}`]);
	});
});

describe("local rendering", () => {
	it("renders the entire inline expression as one SVG", () => {
		const svg = renderMathSvg({ source: "E=mc^2", display: false });
		expect(svg.match(/<svg /g)).toHaveLength(1);
		expect(svg).toContain('data-c="1D438"');
		expect(svg).toContain('data-c="32"');
	});
	it.each([
		String.raw`x_i^2+\frac{1}{2}`,
		String.raw`\begin{pmatrix}1 & 2\\3 & 4\end{pmatrix}`,
		String.raw`\begin{aligned}a&=b+c\\d&=e\end{aligned}`,
	])("renders %s with self-contained paths", (source) => {
		const svg = renderMathSvg({ source, display: true });
		expect(svg).toContain("<path");
		expect(svg).not.toContain("<merror");
		expect(svg).not.toContain("<use");
		expect(renderMathSvg({ source, display: true })).toBe(svg);
	});
	it("rejects invalid TeX, remote resources and excessive input", () => {
		for (const source of [
			String.raw`\frac{`,
			String.raw`\href{https://example.com}{x}`,
			String.raw`\require{html}`,
			"x".repeat(16385),
		])
			expect(() => renderMathSvg({ source, display: false })).toThrow();
	});
	it("isolates custom macros between expressions", () => {
		renderMathSvg({ source: String.raw`\newcommand{\custom}{x}\custom`, display: false });
		expect(() => renderMathSvg({ source: String.raw`\custom`, display: false })).toThrow();
	});
});

it("deduplicates attachments while preserving inline position and display blocks", async () => {
	const captureMath = vi.fn(
		async (items) =>
			new Map(items.map((item: { name: string }) => [item.name, Buffer.from("png")])),
	);
	const plugin = new MathRendererPlugin({ captureMath });
	const adf = parse("Before $x$ middle $x$ after.\n\n$$x$$");
	const uploadBuffer = vi.fn(async (filename) => ({
		filename,
		id: filename,
		collection: "test",
		width: 20,
		height: 16,
		status: "uploaded",
	}));
	const items = plugin.extract(adf);
	expect(items).toHaveLength(2);
	const images = await plugin.transform(items, { uploadBuffer } as unknown as PublisherFunctions);
	const output = plugin.load(adf, images);
	expect(uploadBuffer).toHaveBeenCalledTimes(2);
	expect(output.content![0]!.content!.map((node) => node.type)).toEqual([
		"text",
		"mediaInline",
		"text",
		"mediaInline",
		"text",
	]);
	expect(output.content![1]!.type).toBe("mediaSingle");
	expect(output.content![0]!.content![1]!.attrs).toMatchObject({
		type: "image",
		width: 10,
		height: 8,
	});
});

it("fails instead of silently dropping equations when a renderer returns no image", async () => {
	const plugin = new MathRendererPlugin({ captureMath: async () => new Map() });
	await expect(
		plugin.transform(plugin.extract(parse("$x$")), {} as PublisherFunctions),
	).rejects.toThrow("did not produce");
});

it("round trips equation source through the file conversion APIs", () => {
	const document = parse("Before $x_i^2$ after.\n\n$$\\frac{1}{2}$$");
	const markdown = convertADFToMarkdown(document);
	expect(markdown).toContain("$x_i^2$");
	expect(markdown).toContain(String.raw`\frac{1}{2}`);
	expect(parse(markdown)).toEqual(document);
});

it("reports missing library renderer configuration before uploading unsupported ADF", async () => {
	await expect(
		executeADFProcessingPipeline([], parse("$x$"), {} as PublisherFunctions),
	).rejects.toThrow("require MathRendererPlugin");
});
