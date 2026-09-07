import { afterEach, expect, test, vi } from "@effect/vitest";
import { EventEmitter } from "node:events";
vi.doMock("node:https", () => ({ request: vi.fn() }));
const { request } = await import("node:https");
const { desktopFetch } = await import("./desktopFetch");
afterEach(() => vi.clearAllMocks());

function serverResponse(status = 200) {
	const incoming = Object.assign(new EventEmitter(), {
		statusCode: status,
		statusMessage: "Test",
		destroy: vi.fn(),
	});
	const outgoing = Object.assign(new EventEmitter(), {
		end: vi.fn(() => {
			queueMicrotask(() => {
				const callback = vi.mocked(request).mock.calls[0][2] as (response: unknown) => void;
				callback(incoming);
				incoming.emit("data", Buffer.from('{"id":"page"}'));
				incoming.emit("end");
			});
		}),
	});
	vi.mocked(request).mockReturnValue(outgoing as never);
	return { incoming, outgoing };
}

test("uses HTTPS with the abort signal and preserves token bodies and response status", async () => {
	const fixture = serverResponse();
	const signal = new AbortController().signal;
	const response = await desktopFetch("https://auth.atlassian.com/oauth/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: "client_secret=a%2Bb",
		signal,
		redirect: "error",
	});
	expect(vi.mocked(request).mock.calls[0][1]).toMatchObject({ signal, method: "POST" });
	expect(fixture.outgoing.end).toHaveBeenCalledWith("client_secret=a%2Bb");
	expect(response.ok).toBe(true);
	expect(await response.json()).toEqual({ id: "page" });
});

test("rejects redirects without sending credentials to another destination", async () => {
	const fixture = serverResponse(307);
	await expect(desktopFetch("https://auth.atlassian.com/oauth/token", {})).rejects.toThrow(
		"redirects are not permitted",
	);
	expect(request).toHaveBeenCalledOnce();
	expect(fixture.incoming.destroy).toHaveBeenCalledOnce();
});

test("rejects insecure transport before making a request", async () => {
	await expect(desktopFetch("http://example.com", {})).rejects.toThrow("require HTTPS");
	expect(request).not.toHaveBeenCalled();
});
