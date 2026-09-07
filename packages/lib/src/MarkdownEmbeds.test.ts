import { expect, test } from "@effect/vitest";
import { findMarkdownEmbeds, rebaseEmbeddedLinks, selectEmbeddedMarkdown } from "./MarkdownEmbeds";

test("finds embeds outside code, escaped text, and HTML comments", () => {
	const markdown = [
		"![[real]] and `![[inline]]` and \\![[escaped]]",
		"",
		"```md",
		"![[fenced]]",
		"```",
		"",
		"    ![[indented]]",
		"",
		"> ```md",
		"> ![[quoted-code]]",
		"> ```",
		"",
		"<!-- ![[comment]] -->",
		"",
		"`unclosed",
		"",
		"![[another]]",
		"",
		"`unclosed too",
	].join("\n");
	expect(findMarkdownEmbeds(markdown).map((match) => match[1])).toEqual(["real", "another"]);
});

test("selects only the requested heading and its descendants", () => {
	const markdown =
		"# Title\nIntro\n\n## **Selected** section\nKeep\n\n### Nested\nAlso keep\n\n## Next\nOmit";
	const section = selectEmbeddedMarkdown(markdown, "Selected%20section");
	expect(section).toContain("Keep");
	expect(section).toContain("Also keep");
	expect(section).not.toContain("Intro");
	expect(section).not.toContain("Omit");
	expect(() => selectEmbeddedMarkdown(markdown, "missing")).toThrow("not found");
});

test("selects an Obsidian paragraph block without its marker", () => {
	expect(
		selectEmbeddedMarkdown("Before\n\nSelected paragraph ^block-1\n\nAfter", "^block-1"),
	).toBe("Selected paragraph");
});

test("rebases media and page links while preserving literals, dimensions, and fragments", () => {
	const markdown =
		"![[image.png|160]]\n\n![Alt](<image space.png>)\n\n[Page](note.md#Heading)\n\n`![code](image.png)`\n\n[External](https://example.com)\n\n[[#Local]]";
	const result = rebaseEmbeddedLinks(markdown, (target) => `../shared/${target}`);
	expect(result).toContain("![[../shared/image.png|160]]");
	expect(result).toContain("![Alt](<../shared/image space.png>)");
	expect(result).toContain("[Page](../shared/note.md#Heading)");
	expect(result).toContain("`![code](image.png)`");
	expect(result).toContain("[External](https://example.com)");
	expect(result).toContain("[[#Local]]");
});
