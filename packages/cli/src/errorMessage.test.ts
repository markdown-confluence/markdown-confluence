import { expect, test } from "@effect/vitest";
import { Cause } from "effect";
import { getErrorMessage } from "./errorMessage";

test("prints nested error causes without recursing on a circular Error", () => {
	const failure = new Error("Upload failed");
	failure.cause = failure;
	expect(getErrorMessage(failure)).toBe("Upload failed\nCaused by: [Circular error]");
});

test("provides useful text for empty errors and Effect causes", () => {
	expect(getErrorMessage(new Error())).toContain("Error");
	expect(getErrorMessage({})).toBe("Unknown error");
	expect(getErrorMessage(Cause.fail(new Error("Permission denied")))).toContain(
		"Permission denied",
	);
});

test("redacts credentials embedded in structured HTTP errors", () => {
	const formatted = getErrorMessage({
		statusCode: 403,
		config: {
			headers: { Authorization: "Bearer private-value" },
			atlassianApiToken: "private-api-token",
		},
	});
	expect(formatted).toContain("403");
	expect(formatted).not.toContain("private-value");
	expect(formatted).not.toContain("private-api-token");
});
