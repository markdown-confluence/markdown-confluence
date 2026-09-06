import { expect, test } from "@effect/vitest";
import plantumlEncoder from "plantuml-encoder";
import { HttpPlantumlRenderer } from "./index";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makeFakeFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
	return ((url: string, init?: RequestInit) => impl(url, init)) as unknown as typeof fetch;
}

test("encodes the source and hits ${serverUrl}/png/<encoded>", async () => {
	const fetchImpl = makeFakeFetch(async (url) => {
		expect(url).toBe(
			`https://example.test/plantuml/png/${plantumlEncoder.encode("@startuml\nA -> B\n@enduml")}`,
		);
		return new Response(PNG_BYTES, { status: 200 });
	});

	const renderer = new HttpPlantumlRenderer({
		serverUrl: "https://example.test/plantuml",
		fetchImpl,
	});

	const result = await renderer.capturePlantumlCharts([
		{ name: "diagram-1.png", data: "@startuml\nA -> B\n@enduml" },
	]);

	expect(result.size).toBe(1);
	expect(result.get("diagram-1.png")).toEqual(Buffer.from(PNG_BYTES));
});

test("trailing slash on serverUrl is normalized", async () => {
	const fetchImpl = makeFakeFetch(async (url) => {
		expect(url.startsWith("https://example.test/plantuml/png/")).toBe(true);
		return new Response(PNG_BYTES, { status: 200 });
	});

	const renderer = new HttpPlantumlRenderer({
		serverUrl: "https://example.test/plantuml/",
		fetchImpl,
	});

	await renderer.capturePlantumlCharts([
		{ name: "diagram.png", data: "@startuml\nA->B\n@enduml" },
	]);
});

test("non-2xx responses surface status, server URL, and a body preview", async () => {
	const fetchImpl = makeFakeFetch(async () => new Response("server is grumpy", { status: 503 }));

	const renderer = new HttpPlantumlRenderer({
		serverUrl: "https://example.test/plantuml",
		fetchImpl,
	});

	await expect(
		renderer.capturePlantumlCharts([{ name: "x.png", data: "@startuml\nA->B\n@enduml" }]),
	).rejects.toThrow(/503/);
});

test("aborts and throws a timeout error when fetch exceeds timeoutMs", async () => {
	const fetchImpl = makeFakeFetch(
		(_url, init) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => {
					const err = new Error("aborted");
					err.name = "AbortError";
					reject(err);
				});
			}),
	);

	const renderer = new HttpPlantumlRenderer({
		serverUrl: "https://example.test/plantuml",
		fetchImpl,
		timeoutMs: 10,
	});

	await expect(
		renderer.capturePlantumlCharts([{ name: "x.png", data: "@startuml\nA->B\n@enduml" }]),
	).rejects.toThrow(/timed out after 10ms/);
});

test("constructor throws if serverUrl is empty", () => {
	expect(
		() =>
			new HttpPlantumlRenderer({
				serverUrl: "",
				fetchImpl: makeFakeFetch(async () => new Response("")),
			}),
	).toThrow(/serverUrl is required/);
});

test("concurrency cap limits in-flight requests", async () => {
	let inFlight = 0;
	let peak = 0;
	const fetchImpl = makeFakeFetch(async () => {
		inFlight++;
		peak = Math.max(peak, inFlight);
		await new Promise((r) => setTimeout(r, 5));
		inFlight--;
		return new Response(PNG_BYTES, { status: 200 });
	});

	const renderer = new HttpPlantumlRenderer({
		serverUrl: "https://example.test/plantuml",
		fetchImpl,
		concurrency: 2,
	});

	const charts = Array.from({ length: 10 }, (_, i) => ({
		name: `c-${i}.png`,
		data: `@startuml\nA${i} -> B${i}\n@enduml`,
	}));

	await renderer.capturePlantumlCharts(charts);
	expect(peak).toBeLessThanOrEqual(2);
});

test("supports svg output format", async () => {
	const fetchImpl = makeFakeFetch(async (url) => {
		expect(url).toContain("/svg/");
		return new Response("<svg/>", { status: 200 });
	});

	const renderer = new HttpPlantumlRenderer({
		serverUrl: "https://example.test/plantuml",
		fetchImpl,
		format: "svg",
	});

	await renderer.capturePlantumlCharts([
		{ name: "diagram.svg", data: "@startuml\nA->B\n@enduml" },
	]);
});
