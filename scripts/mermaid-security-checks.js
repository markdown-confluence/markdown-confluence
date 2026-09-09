import assert from "node:assert/strict";
import { createServer } from "node:http";

/** Shared black-box contract for the packaged Chromium and Electron renderers. */
export async function verifyMermaidResourcePolicy(createRenderer, fileUrl) {
	const requests = [];
	let connections = 0;
	const png = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jkAAAAABJRU5ErkJggg==",
		"base64",
	);
	const server = createServer((request, response) => {
		requests.push(request.url);
		if (request.url === "/redirect") {
			response.writeHead(302, { location: "/private.png" });
			response.end();
		} else {
			response.writeHead(200, { "content-type": "image/png" });
			response.end(png);
		}
	});
	server.on("connection", () => {
		connections += 1;
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const origin = `http://127.0.0.1:${server.address().port}`;
	const checks = [];
	try {
		for (const format of ["png", "svg"]) {
			for (const theme of ["default", "dark"]) {
				const renderer = createRenderer({ format, theme });
				const result = await renderer.captureMermaidCharts([
					{ name: "unicode", data: "flowchart LR\nA[中文 café] --> B[Confluence]" },
					{
						name: "sequence",
						data: "sequenceDiagram\nAlice->>Bob: Hello\nBob-->>Alice: Welcome",
					},
				]);
				for (const image of result.values()) {
					if (format === "png")
						assert.deepEqual(
							[...image.subarray(0, 8)],
							[137, 80, 78, 71, 13, 10, 26, 10],
						);
					else assert.match(image.toString(), /<svg/u);
				}
				assert.equal(result.size, 2);
				checks.push(`${format}-${theme}-unicode-and-sequence`);
			}
			const renderer = createRenderer({ format });
			for (const [name, url] of [
				["loopback", `${origin}/private.png`],
				["https-loopback", `${origin.replace("http:", "https:")}/private.png`],
				["redirect", `${origin}/redirect`],
				["scheme-case", `${origin.replace("http:", "HTTP:")}/private.png`],
				["local-file", fileUrl],
				["data-svg", 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'],
			]) {
				const imageDiagram = `flowchart TD\nA@{ img: '${url}', label: 'Resource', h: 40 }`;
				await assert.rejects(renderer.captureMermaidCharts([{ name, data: imageDiagram }]));
				assert.equal(requests.length, 0, `${name} contacted the controlled server`);
				assert.equal(
					connections,
					0,
					`${name} opened a connection to the controlled server`,
				);
				checks.push(`${format}-blocked-${name}`);
			}
			const styledDiagram = `%%{init: {"themeCSS": "@import url('${origin}/theme.css'); .node { fill: url('${origin}/private.png'); }"}}%%\nflowchart LR\nA-->B`;
			const styled = await renderer.captureMermaidCharts([
				{ name: "css", data: styledDiagram },
			]);
			if (format === "svg") assert.ok(!styled.get("css").toString().includes(origin));
			assert.equal(requests.length, 0);
			checks.push(`${format}-blocked-css`);
			await assert.rejects(
				renderer.captureMermaidCharts([{ name: "invalid", data: "invalid diagram" }]),
			);
			assert.equal(
				(
					await renderer.captureMermaidCharts([
						{ name: "recovered", data: "flowchart LR\nA-->B" },
					])
				).size,
				1,
			);
			checks.push(`${format}-invalid-cleanup-and-recovery`);
		}
		return {
			status: "passed",
			checks,
			diagramRequests: requests.length,
			diagramConnections: connections,
		};
	} finally {
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
}
