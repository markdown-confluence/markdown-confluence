import { expect, test } from "@effect/vitest";
import { Effect } from "effect";
import { transformMarkdownCodeBlocks } from "./MarkdownCodeBlocks";

const replaceQueries = (markdown: string) =>
	Effect.runPromise(
		transformMarkdownCodeBlocks(markdown, (block) =>
			Effect.succeed(
				block.language === "dataview" ? "| Name |\n| --- |\n| Paper |" : undefined,
			),
		),
	);

test("rewrites fenced queries while preserving literal examples and ordinary code", async () => {
	const examples =
		"````markdown\n```dataview\nTABLE example\n```\n````\n\n    ```dataview\n    example\n    ```\n\n<!--\n```dataview\nexample\n```\n-->\n";
	expect(await replaceQueries(examples)).toBe(examples);
	const actual = await replaceQueries(`${examples}\n~~~Dataview\nTABLE authors\n~~~\nAfter`);
	expect(actual).toBe(`${examples}\n| Name |\n| --- |\n| Paper |\nAfter`);
});

test("preserves blockquote, callout and list containers around generated tables", async () => {
	expect(await replaceQueries("> [!note]\n> ```dataview\n> TABLE authors\n> ```\n")).toBe(
		"> [!note]\n> | Name |\n> | --- |\n> | Paper |\n",
	);
	expect(await replaceQueries("- ```dataview\n  TABLE authors\n  ```\n")).toBe(
		"- | Name |\n  | --- |\n  | Paper |\n",
	);
	expect(await replaceQueries("> 1. ```dataview\n>    TABLE authors\n>    ```\n")).toBe(
		"> 1. | Name |\n>    | --- |\n>    | Paper |\n",
	);
});

test("keeps CRLF source outside replacements and handles an unclosed final fence", async () => {
	expect(await replaceQueries("Before\r\n\r\n```dataview\r\nTABLE authors")).toBe(
		"Before\r\n\r\n| Name |\n| --- |\n| Paper |\n",
	);
});

test("does not recursively execute generated query-looking content", async () => {
	let calls = 0;
	const result = await Effect.runPromise(
		transformMarkdownCodeBlocks("```dataview\nTABLE authors\n```", () => {
			calls++;
			return Effect.succeed("```dataview\nnot another execution\n```");
		}),
	);
	expect(calls).toBe(1);
	expect(result).toContain("not another execution");
});
