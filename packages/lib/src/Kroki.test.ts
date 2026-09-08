import { expect, test, vi } from "@effect/vitest";
import {
	HttpKrokiRenderer,
	KrokiRendererPlugin,
	getKrokiFileName,
} from "./ADFProcessingPlugins/KrokiRendererPlugin";
import { parseMarkdownToADF } from "./MdToADF";
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const options = { serverUrl: "https://renderer.example", format: "png" as const, timeoutMs: 1000 };

test("Kroki posts only diagram data, uses the configured format and deduplicates fences", async () => {
	const fetchImpl = vi.fn(
		async () => new Response(png, { headers: { "content-type": "image/png" } }),
	);
	const renderer = new HttpKrokiRenderer({ ...options, fetchImpl });
	const plugin = new KrokiRendererPlugin(renderer);
	const source = "```kroki-graphviz\ndigraph { A -> B }\n```";
	const adf = parseMarkdownToADF(
		source + "\n\n" + source + "\n\n```mermaid\ngraph TD; A-->B\n```",
		"https://example.atlassian.net",
	);
	const charts = plugin.extract(adf);
	expect(charts).toHaveLength(1);
	const output = await renderer.capture(charts);
	expect(output.get(charts[0]!.name)).toEqual(png);
	const request = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
	expect(request[0]).toBe("https://renderer.example");
	expect(request[1].headers).toEqual({ "Content-Type": "application/json", Accept: "image/png" });
	expect(JSON.parse(request[1].body as string)).toEqual({
		diagram_source: "digraph { A -> B }",
		diagram_type: "graphviz",
		output_format: "png",
	});
	const loaded = plugin.load(adf, {
		[charts[0]!.name]: {
			id: "attachment",
			collection: "content",
			width: 100,
			height: 80,
		} as never,
	});
	expect(loaded.content.map((n) => n.type)).toEqual(["mediaSingle", "mediaSingle", "codeBlock"]);
	expect(adf.content[0]!.type).toBe("codeBlock");
	expect(getKrokiFileName("graphviz", "x", "png")).not.toBe(
		getKrokiFileName("ditaa", "x", "png"),
	);
});

test("Kroki validates images and fails without including server response source", async () => {
	for (const response of [
		new Response("secret diagram", { status: 400 }),
		new Response("<html>error</html>", { headers: { "content-type": "text/html" } }),
		new Response("not PNG", { headers: { "content-type": "image/png" } }),
	]) {
		const renderer = new HttpKrokiRenderer({ ...options, fetchImpl: async () => response });
		await expect(
			renderer.capture([{ name: "test", diagramType: "graphviz", data: "source" }]),
		).rejects.toThrow(/Kroki/);
	}
	const renderer = new HttpKrokiRenderer({
		...options,
		format: "svg",
		fetchImpl: async () =>
			new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
				headers: { "content-type": "image/svg+xml; charset=utf-8" },
			}),
	});
	expect(
		(await renderer.capture([{ name: "svg", diagramType: "graphviz", data: "source" }]))
			.get("svg")
			?.toString(),
	).toContain("<svg");
});

test("Kroki aborts timed out requests and rejects unsafe server configuration", async () => {
	const renderer = new HttpKrokiRenderer({
		...options,
		timeoutMs: 5,
		fetchImpl: async (_url, request) =>
			new Promise((_resolve, reject) =>
				request?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
			),
	});
	await expect(
		renderer.capture([{ name: "slow", diagramType: "graphviz", data: "x" }]),
	).rejects.toThrow("timed out");
	for (const serverUrl of [
		"file:///tmp/render",
		"https://user:pass@example.com",
		"https://example.com?token=x",
	])
		expect(() => new HttpKrokiRenderer({ ...options, serverUrl })).toThrow();
	expect(() => new HttpKrokiRenderer({ ...options, timeoutMs: 0 })).toThrow();
	const plugin = new KrokiRendererPlugin(new HttpKrokiRenderer(options));
	expect(
		plugin.extract(
			parseMarkdownToADF("```kroki-graphviz\n\n```", "https://example.atlassian.net"),
		),
	).toEqual([]);
});
