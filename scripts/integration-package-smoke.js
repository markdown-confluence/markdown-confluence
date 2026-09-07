import assert from "node:assert/strict";

/** Runs unchanged against workspace builds and an isolated tarball consumer. */
export async function verifyPackageImports(resolvePackage) {
	const libraryUrl = resolvePackage("lib");
	const library = await import(libraryUrl);
	const { HttpPlantumlRenderer } = await import(resolvePackage("plantuml-renderer"));
	const { PuppeteerMermaidRenderer } = await import(resolvePackage("mermaid-puppeteer-renderer"));
	const adf = library.parseMarkdownToADF(
		"# Integration check\n\n中文 café ✓\n\n```toc\n```\n\n**Bold** and [link](https://example.com).",
		"https://example.atlassian.net",
	);
	assert.equal(adf.type, "doc");
	assert.ok(JSON.stringify(adf).includes('"extensionKey":"toc"'));
	assert.ok(JSON.stringify(adf).includes('"type":"strong"'));
	assert.ok(JSON.stringify(adf).includes("中文 café ✓"));
	// This deterministic transport checks the packaged renderer contract. The live
	// profile separately exercises the real PlantUML server and attachment upload.
	const plantuml = new HttpPlantumlRenderer({
		serverUrl: "https://example.test/plantuml",
		format: "svg",
		fetchImpl: async (url) => {
			assert.match(url, /^https:\/\/example\.test\/plantuml\/svg\/[^/]+$/);
			return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>');
		},
	});
	const diagrams = await plantuml.capturePlantumlCharts([
		{ name: "integration.svg", data: "@startuml\nAlice -> Bob: Test\n@enduml" },
	]);
	assert.match(diagrams.get("integration.svg").toString(), /<svg/);
	const mermaid = new PuppeteerMermaidRenderer({ protocolTimeout: 60000 });
	const images = await mermaid.captureMermaidCharts([
		{ name: "integration.png", data: "flowchart LR\nMarkdown --> Confluence" },
	]);
	assert.deepEqual(
		[...images.get("integration.png").subarray(0, 8)],
		[137, 80, 78, 71, 13, 10, 26, 10],
	);
	assert.ok(images.get("integration.png").length > 100);
	console.log(
		"Package imports, Markdown/TOC, PlantUML contract and real Chromium rendering passed.",
	);
}
