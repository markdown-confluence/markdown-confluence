import { afterEach, expect, test } from "@effect/vitest";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { runEffect } from "./effects";
import { DEFAULT_SETTINGS } from "./Settings";
import { makeMarkdownWorkspaceEffect } from "./MarkdownWorkspace";
import {
	MarkdownExpansionLimitsService,
	type MarkdownExpansionLimits,
} from "./MarkdownExpansionBudget";
import {
	MarkdownPublishFilter,
	MarkdownSourceTransformerService,
	type MarkdownSourceTransformer,
} from "./MarkdownSourceTransformer";
import { rebaseEmbeddedLinks } from "./MarkdownEmbeds";

const temporaryRoots: string[] = [];
afterEach(async () => {
	await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			for (const directory of temporaryRoots.splice(0))
				yield* fs.remove(directory, { recursive: true, force: true });
		}),
	);
});

const testLimits = { maxEmbeds: 20, maxPageBytes: 4096, maxWorkBytes: 64 * 1024 };
async function fixture(
	files: Record<string, string>,
	limits: Partial<MarkdownExpansionLimits> = {},
	transformer?: MarkdownSourceTransformer,
) {
	return runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;
			const root = yield* fs.makeTempDirectory({ prefix: "confluence-expansion-" });
			temporaryRoots.push(root);
			for (const [name, content] of Object.entries(files)) {
				yield* fs.makeDirectory(path.dirname(path.join(root, name)), { recursive: true });
				yield* fs.writeFileString(path.join(root, name), content);
			}
			const workspace = yield* makeMarkdownWorkspaceEffect({
				...DEFAULT_SETTINGS,
				contentRoot: root,
				folderToPublish: ".",
			}).pipe(
				Effect.provideService(MarkdownExpansionLimitsService, { ...testLimits, ...limits }),
				Effect.provideService(
					MarkdownSourceTransformerService,
					transformer ?? { transform: (content) => Effect.succeed(content) },
				),
			);
			return { root, workspace };
		}),
	);
}

test("shares one resolution budget across every branch of an acyclic embed graph", async () => {
	const files: Record<string, string> = { "leaf.md": "" };
	for (let depth = 0; depth < 12; depth++) {
		const next = depth === 11 ? "leaf" : `level${depth + 1}`;
		files[`level${depth}.md`] = `![[${next}]] ![[${next}]]`;
	}
	let transforms = 0;
	const { root, workspace } = await fixture(
		files,
		{ maxEmbeds: 6 },
		{
			transform: (content) =>
				Effect.sync(() => {
					transforms++;
					return content;
				}),
		},
	);
	await expect(
		Effect.runPromise(workspace.loadMarkdownFile(`${root}/level0.md`)),
	).rejects.toThrow("embed count");
	expect(transforms).toBe(7);
});

test("counts repeated empty sibling embeds and resets the budget between preparations", async () => {
	const { root, workspace } = await fixture(
		{
			"page.md": "![[empty]] ![[empty]]",
			"too-many.md": "![[empty]] ![[empty]] ![[empty]]",
			"empty.md": "",
		},
		{ maxEmbeds: 2 },
	);
	await expect(
		Effect.runPromise(workspace.loadMarkdownFile(`${root}/too-many.md`)),
	).rejects.toThrow("embed count");
	expect(
		(await Effect.runPromise(workspace.loadMarkdownFile(`${root}/page.md`))).contents.trim(),
	).toBe("");
	expect(
		(await Effect.runPromise(workspace.loadMarkdownFile(`${root}/page.md`))).contents.trim(),
	).toBe("");
});

test("rejects the expanded output before it exceeds the byte limit", async () => {
	const { root, workspace } = await fixture(
		{ "page.md": "![[leaf]] ![[leaf]]", "leaf.md": "é".repeat(40) },
		{ maxPageBytes: 100 },
	);
	await expect(Effect.runPromise(workspace.loadMarkdownFile(`${root}/page.md`))).rejects.toThrow(
		"page bytes",
	);
});

test("enforces cumulative work even when each expanded output is small", async () => {
	const { root, workspace } = await fixture(
		{ "page.md": "![[middle]]", "middle.md": "![[leaf]]", "leaf.md": "plain content" },
		{ maxWorkBytes: 80 },
	);
	await expect(Effect.runPromise(workspace.loadMarkdownFile(`${root}/page.md`))).rejects.toThrow(
		"work bytes",
	);
});

test("rejects oversized source before invoking source transformations", async () => {
	let transforms = 0;
	const { root, workspace } = await fixture(
		{ "page.md": "x".repeat(101) },
		{ maxPageBytes: 100 },
		{
			transform: (content) =>
				Effect.sync(() => {
					transforms++;
					return content;
				}),
		},
	);
	await expect(Effect.runPromise(workspace.loadMarkdownFile(`${root}/page.md`))).rejects.toThrow(
		"page bytes",
	);
	expect(transforms).toBe(0);
});

test("checks transformed input and counts its generated references", async () => {
	const large = await fixture(
		{ "page.md": "source" },
		{ maxPageBytes: 100 },
		{ transform: () => Effect.succeed("x".repeat(101)) },
	);
	await expect(
		Effect.runPromise(large.workspace.loadMarkdownFile(`${large.root}/page.md`)),
	).rejects.toThrow("page bytes");
	const embeds = await fixture(
		{ "page.md": "source", "leaf.md": "" },
		{ maxEmbeds: 2 },
		{
			transform: (content) =>
				Effect.succeed(content === "source" ? "![[leaf]] ![[leaf]] ![[leaf]]" : content),
		},
	);
	await expect(
		Effect.runPromise(embeds.workspace.loadMarkdownFile(`${embeds.root}/page.md`)),
	).rejects.toThrow("embed count");
});

test("checks expansion even when a publish filter disables source transforms", async () => {
	let transforms = 0;
	const { workspace } = await fixture(
		{ "page.md": "![[leaf]] ![[leaf]]", "leaf.md": "" },
		{ maxEmbeds: 1 },
		{
			transform: (content) =>
				Effect.sync(() => {
					transforms++;
					return content;
				}),
		},
	);
	await expect(
		Effect.runPromise(
			workspace.getMarkdownFilesToUpload.pipe(
				Effect.provideService(MarkdownPublishFilter, "not-selected.md"),
			),
		),
	).rejects.toThrow("embed count");
	expect(transforms).toBe(0);
});

test("preserves byte-boundary content, unresolved embeds, section errors and cycles", async () => {
	const { root, workspace } = await fixture(
		{
			"page.md": "é".repeat(50),
			"missing.md": "![[absent]]",
			"cycle.md": "![[cycle]]",
			"section.md": "![[page#absent]]",
		},
		{ maxPageBytes: 100 },
	);
	expect((await Effect.runPromise(workspace.loadMarkdownFile(`${root}/page.md`))).contents).toBe(
		"é".repeat(50),
	);
	expect(
		(await Effect.runPromise(workspace.loadMarkdownFile(`${root}/missing.md`))).contents,
	).toBe("![[absent]]");
	await expect(Effect.runPromise(workspace.loadMarkdownFile(`${root}/cycle.md`))).rejects.toThrow(
		"Circular",
	);
	await expect(
		Effect.runPromise(workspace.loadMarkdownFile(`${root}/section.md`)),
	).rejects.toThrow("section or block not found");
});

test("rejects link-rebasing growth before constructing an oversized result", () => {
	expect(() => rebaseEmbeddedLinks("[one](a) [two](a)", () => "x".repeat(70), 100)).toThrow(
		"rebased page bytes",
	);
});

test("cancels while expanding an embedded source without visiting later siblings", async () => {
	const started = Promise.withResolvers<void>();
	let transformations = 0;
	const { root, workspace } = await fixture(
		{ "page.md": "![[leaf]] ![[leaf]]", "leaf.md": "wait" },
		{},
		{
			transform: (content) =>
				Effect.gen(function* () {
					transformations++;
					if (content === "wait") {
						started.resolve();
						return yield* Effect.never;
					}
					return content;
				}),
		},
	);
	const cancellation = new AbortController();
	const pending = Effect.runPromise(workspace.loadMarkdownFile(`${root}/page.md`), {
		signal: cancellation.signal,
	});
	const rejected = expect(pending).rejects.toThrow(/interrupt/i);
	await started.promise;
	cancellation.abort();
	await rejected;
	expect(transformations).toBe(2);
});

test("retains the depth limit for a long acyclic chain", async () => {
	const files: Record<string, string> = { "level50.md": "end" };
	for (let depth = 0; depth < 50; depth++) files[`level${depth}.md`] = `![[level${depth + 1}]]`;
	const { root, workspace } = await fixture(files, { maxEmbeds: 100 });
	await expect(
		Effect.runPromise(workspace.loadMarkdownFile(`${root}/level0.md`)),
	).rejects.toThrow("excessively nested");
});

test.each([0, -1, NaN, Infinity, 0.5, undefined])(
	"rejects invalid trusted expansion limits: %s",
	async (maxEmbeds) => {
		await expect(
			fixture({ "page.md": "safe" }, { maxEmbeds } as Partial<MarkdownExpansionLimits>),
		).rejects.toThrow("positive safe integer");
	},
);
