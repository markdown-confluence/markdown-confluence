import { expect, test } from "@effect/vitest";
import { parseConversionOptions } from "./conversionOptions";

test("conversion commands accept files, stdin, output and explicit page references", () => {
	expect(parseConversionOptions(["notes.md", "-o", "page.json"], "to-adf")).toMatchObject({
		input: "notes.md",
		output: "page.json",
	});
	expect(parseConversionOptions(["-", "--output=-"], "to-adf")).toMatchObject({
		input: "-",
		output: "-",
	});
	expect(
		parseConversionOptions(
			["--page", "123", "--config", "test.json", "--readable"],
			"to-markdown",
		),
	).toMatchObject({ page: "123", config: "test.json", lossless: false });
	expect(
		parseConversionOptions(
			["https://example.atlassian.net/wiki/spaces/D/pages/123/Title"],
			"to-markdown",
		),
	).toMatchObject({ page: "https://example.atlassian.net/wiki/spaces/D/pages/123/Title" });
	expect(parseConversionOptions(["--", "-file.json"], "to-markdown").input).toBe("-file.json");
});

test("rejects ambiguous inputs, unsupported options and missing values", () => {
	for (const args of [
		["one", "two"],
		["one", "--page", "123"],
		["--output"],
		["--output", "--readable"],
		["--unknown"],
		["--input", "a", "--input", "b"],
	]) {
		expect(() => parseConversionOptions(args, "to-markdown")).toThrow();
	}
	expect(() => parseConversionOptions(["--readable"], "to-adf")).toThrow(
		"only supported by to-markdown",
	);
});
