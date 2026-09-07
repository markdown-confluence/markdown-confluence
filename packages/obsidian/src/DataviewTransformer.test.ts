import { afterEach, expect, test, vi } from "@effect/vitest";
import type { App } from "obsidian";
import { Effect } from "effect";
import { createDataviewTransformer, type DataviewApi } from "./DataviewTransformer";

const context = {
	absoluteFilePath: "/Notes/Bibliography.md",
	sourcePath: "Notes/Bibliography.md",
	frontmatter: {},
};
const query = '```dataview\nTABLE authors FROM "Papers"\n```';
const settings = { renderDataview: true };
const render = (fixture: ReturnType<typeof setup>, markdown = query) =>
	Effect.runPromise(
		createDataviewTransformer(fixture.app, settings).transform(markdown, context),
	);

function setup() {
	const queryMarkdown = vi
		.fn<DataviewApi["queryMarkdown"]>()
		.mockResolvedValue({ successful: true, value: "| Authors |\n| --- |\n| Ada, Grace |" });
	const api: DataviewApi = {
		index: {
			initialized: true,
			pages: new Map([["Notes/Bibliography.md", { mtime: { toMillis: () => 10 } }]]),
		},
		queryMarkdown,
	};
	const files = [{ path: "Notes/Bibliography.md", stat: { mtime: 10 } }];
	const plugins: { dataview?: { api: DataviewApi } } = { dataview: { api } };
	const app = {
		plugins: { plugins },
		vault: { getMarkdownFiles: () => files },
	} as unknown as App;
	return { app, api, queryMarkdown, files, plugins };
}

afterEach(() => vi.useRealTimers());

test("exports query results with source context and HTML disabled", async () => {
	const fixture = setup();
	expect(await render(fixture)).toContain("| Ada, Grace |");
	expect(fixture.queryMarkdown).toHaveBeenCalledWith(
		'TABLE authors FROM "Papers"\n',
		"Notes/Bibliography.md",
		{ allowHtml: false },
	);
});

test("disabled support, ignored languages and literal examples never require Dataview", async () => {
	const fixture = setup();
	delete fixture.plugins.dataview;
	for (const configuration of [
		{ renderDataview: false },
		{ ...settings, ignoredCodeBlockLanguages: [" DataView "] },
	]) {
		expect(
			await Effect.runPromise(
				createDataviewTransformer(fixture.app, configuration).transform(query, context),
			),
		).toBe(query);
	}
	const example = "````markdown\n" + query + "\n````";
	expect(await render(fixture, example)).toBe(example);
	expect(fixture.queryMarkdown).not.toHaveBeenCalled();
});

test("missing Dataview and query errors identify the source note", async () => {
	const fixture = setup();
	delete fixture.plugins.dataview;
	await expect(render(fixture)).rejects.toThrow(
		"Dataview in Notes/Bibliography.md (line 1): Enable Dataview",
	);
	fixture.plugins.dataview = { api: fixture.api };
	fixture.queryMarkdown.mockResolvedValue({ successful: false, error: "Invalid query" });
	await expect(render(fixture)).rejects.toThrow("Invalid query");
});

test("empty successful results are valid while unsupported forms fail explicitly", async () => {
	const fixture = setup();
	fixture.queryMarkdown.mockResolvedValue({ successful: true, value: "" });
	expect((await render(fixture)).trim()).toBe("");
	await expect(render(fixture, "```dataviewjs\ndv.table([])\n```")).rejects.toThrow(
		"DataviewJS publication is not supported",
	);
	fixture.queryMarkdown.mockResolvedValue({
		successful: false,
		error: "Cannot render calendar queries to markdown.",
	});
	await expect(render(fixture, "```dataview\nCALENDAR file.mtime\n```")).rejects.toThrow(
		"Cannot render calendar",
	);
});

test("waits for initial indexing and a recently edited dependency before querying", async () => {
	vi.useFakeTimers();
	const fixture = setup();
	fixture.api.index.initialized = false;
	fixture.files.push({ path: "Papers/Paper.md", stat: { mtime: 20 } });
	const result = render(fixture);
	await vi.advanceTimersByTimeAsync(100);
	expect(fixture.queryMarkdown).not.toHaveBeenCalled();
	fixture.api.index.initialized = true;
	fixture.api.index.pages.set("Papers/Paper.md", { mtime: { toMillis: () => 19 } });
	await vi.advanceTimersByTimeAsync(100);
	expect(fixture.queryMarkdown).not.toHaveBeenCalled();
	fixture.api.index.pages.set("Papers/Paper.md", { mtime: { toMillis: () => 20 } });
	await vi.advanceTimersByTimeAsync(100);
	await result;
	expect(fixture.queryMarkdown).toHaveBeenCalledTimes(1);
});

test("index readiness wait is bounded", async () => {
	vi.useFakeTimers();
	const fixture = setup();
	fixture.api.index.initialized = false;
	const assertion = expect(render(fixture)).rejects.toThrow(
		"indexing did not finish within 15 seconds",
	);
	await vi.advanceTimersByTimeAsync(15001);
	await assertion;
});

test("queries are bounded and results are recomputed for subsequent publications", async () => {
	const fixture = setup();
	await render(fixture);
	fixture.queryMarkdown.mockResolvedValue({ successful: true, value: "Updated authors" });
	expect(await render(fixture)).toContain("Updated authors");
	vi.useFakeTimers();
	fixture.queryMarkdown.mockImplementation(() => new Promise(() => {}));
	const assertion = expect(render(fixture)).rejects.toThrow("exceeded 30 seconds");
	await vi.advanceTimersByTimeAsync(30001);
	await assertion;
});
