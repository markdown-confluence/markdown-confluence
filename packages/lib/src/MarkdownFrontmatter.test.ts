import { expect, test } from "@effect/vitest";
import { parseMarkdownFrontmatter, stringifyMarkdownFrontmatter } from "./MarkdownFrontmatter";

test("parses leading YAML frontmatter", () => {
	const parsed = parseMarkdownFrontmatter(`---
title: Hello
tags:
  - docs
  - confluence
published: true
---
# Hello
`);

	expect(parsed).toEqual({
		data: {
			title: "Hello",
			tags: ["docs", "confluence"],
			published: true,
		},
		content: "# Hello\n",
	});
});

test("returns empty data when a file has no frontmatter", () => {
	const parsed = parseMarkdownFrontmatter("# Hello\n");

	expect(parsed).toEqual({ data: {}, content: "# Hello\n" });
});

test("returns the full content when an opening delimiter is not closed", () => {
	const content = `---
title: Hello
# Hello
`;

	expect(parseMarkdownFrontmatter(content)).toEqual({ data: {}, content });
});

test("returns empty data when frontmatter YAML is malformed", () => {
	const parsed = parseMarkdownFrontmatter(`---
title: [Hello
---
# Hello
`);

	expect(parsed).toEqual({ data: {}, content: "# Hello\n" });
});

test("stringifies merged frontmatter data", () => {
	const parsed = parseMarkdownFrontmatter(`---
title: Hello
draft: true
---
# Hello
`);

	expect(
		stringifyMarkdownFrontmatter(parsed, {
			draft: false,
			pageId: "123",
		}),
	).toBe(`---
title: Hello
draft: false
pageId: "123"
---
# Hello
`);
});

test("omits empty frontmatter when no data is present", () => {
	expect(stringifyMarkdownFrontmatter({ data: {}, content: "# Hello" }, {})).toBe("# Hello\n");
});
