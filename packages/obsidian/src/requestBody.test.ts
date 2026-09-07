import { expect, test } from "@effect/vitest";
import { toRequestArrayBuffer } from "./requestBody";

test("sends only the multipart payload when the buffer shares a larger allocation", () => {
	const allocation = Buffer.from("unrelated bytes|multipart body|unrelated bytes");
	const payload = allocation.subarray(16, 30);
	expect(Buffer.from(toRequestArrayBuffer(payload)).toString()).toBe("multipart body");
});
