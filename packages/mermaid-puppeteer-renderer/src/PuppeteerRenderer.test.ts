import { afterEach, expect, test } from "@effect/vitest";

declare const vi: typeof import("@effect/vitest").vi;

const mocks = vi.hoisted(() => ({ launch: vi.fn(), download: vi.fn() }));
vi.mock("puppeteer", () => ({
	default: { executablePath: () => "/test/chrome", launch: mocks.launch },
}));
vi.mock("puppeteer/lib/puppeteer/node/install.js", () => ({ downloadBrowsers: mocks.download }));
import { PuppeteerMermaidRenderer } from "./index";

afterEach(() => vi.resetAllMocks());

test("uses the configured protocol timeout and one browser for multiple charts", async () => {
	const page = {
		goto: vi.fn(),
		evaluate: vi.fn().mockResolvedValue({ width: 160, height: 80 }),
		setViewport: vi.fn(),
		screenshot: vi.fn().mockResolvedValue(Buffer.from("image")),
		close: vi.fn(),
	};
	const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() };
	mocks.launch.mockResolvedValue(browser);
	const result = await new PuppeteerMermaidRenderer({
		protocolTimeout: 600_000,
	}).captureMermaidCharts([
		{ name: "first", data: "graph LR; A-->B" },
		{ name: "second", data: "graph LR; B-->C" },
	]);
	expect(mocks.launch).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ protocolTimeout: 600_000 }),
	);
	expect(result.size).toBe(2);
	expect(page.close).toHaveBeenCalledTimes(2);
	expect(browser.close).toHaveBeenCalledOnce();
});

test("closes the browser even if creating a page fails", async () => {
	const browser = {
		newPage: vi.fn().mockRejectedValue(new Error("page failed")),
		close: vi.fn(),
	};
	mocks.launch.mockResolvedValue(browser);
	await expect(
		new PuppeteerMermaidRenderer().captureMermaidCharts([
			{ name: "first", data: "graph LR; A-->B" },
		]),
	).rejects.toThrow("page failed");
	expect(browser.close).toHaveBeenCalledOnce();
});

test("does not launch or download a browser for an empty document", async () => {
	expect((await new PuppeteerMermaidRenderer().captureMermaidCharts([])).size).toBe(0);
	expect(mocks.download).not.toHaveBeenCalled();
	expect(mocks.launch).not.toHaveBeenCalled();
});

test.each([0, -1, NaN, Infinity, 0.5, 2_147_483_648])(
	"rejects invalid protocol timeout %s",
	(protocolTimeout) => {
		expect(() => new PuppeteerMermaidRenderer({ protocolTimeout })).toThrow("protocol timeout");
	},
);
