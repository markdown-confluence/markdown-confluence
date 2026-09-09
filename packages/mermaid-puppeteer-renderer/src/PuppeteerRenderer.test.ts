import { afterEach, expect, test } from "@effect/vitest";

declare const vi: typeof import("@effect/vitest").vi;

const mocks = vi.hoisted(() => ({ launch: vi.fn(), download: vi.fn() }));
vi.mock("puppeteer", () => ({
	default: { executablePath: () => "/test/chrome", launch: mocks.launch },
}));
vi.mock("puppeteer/lib/puppeteer/node/install.js", () => ({ downloadBrowsers: mocks.download }));
import { PuppeteerMermaidRenderer } from "./index";

afterEach(() => {
	vi.resetAllMocks();
	vi.unstubAllGlobals();
});

function mockPage() {
	const mainFrame = {};
	const listeners = new Map<string, (...args: unknown[]) => void>();
	const page = {
		goto: vi.fn(),
		evaluate: vi
			.fn()
			.mockResolvedValue({ width: 160, height: 80, svg: "<svg>validated</svg>" }),
		evaluateOnNewDocument: vi.fn(),
		setRequestInterception: vi.fn(),
		on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
			listeners.set(event, listener);
		}),
		mainFrame: () => mainFrame,
		setViewport: vi.fn(),
		screenshot: vi.fn().mockResolvedValue(Buffer.from("image")),
		close: vi.fn(),
	};
	return { page, listeners, mainFrame };
}

function mockRequest(url: string, frame: object, navigation = false, resourceType = "image") {
	return {
		url: () => url,
		frame: () => frame,
		isNavigationRequest: () => navigation,
		resourceType: () => resourceType,
		continue: vi.fn().mockResolvedValue(undefined),
		abort: vi.fn().mockResolvedValue(undefined),
	};
}

test("uses the configured protocol timeout and one browser for multiple charts", async () => {
	const { page } = mockPage();
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
	expect(mocks.launch.mock.calls[0][0].args).not.toContain("--ignore-certificate-errors");
});

test("installs the resource policy before loading the renderer and captures validated SVG", async () => {
	const { page, listeners, mainFrame } = mockPage();
	page.goto.mockImplementation(async (url: string) => {
		expect(page.setRequestInterception).toHaveBeenCalledExactlyOnceWith(true);
		expect(page.evaluateOnNewDocument).toHaveBeenCalledOnce();
		expect(listeners.has("popup")).toBe(true);
		const documentRequest = mockRequest(url, mainFrame, true, "document");
		listeners.get("request")!(documentRequest);
		expect(documentRequest.continue).toHaveBeenCalledOnce();
		expect(documentRequest.abort).not.toHaveBeenCalled();
	});
	const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() };
	mocks.launch.mockResolvedValue(browser);
	const result = await new PuppeteerMermaidRenderer({}, { format: "svg" }).captureMermaidCharts([
		{ name: "safe", data: "graph LR; A-->B" },
	]);
	expect(result.get("safe")?.toString()).toBe("<svg>validated</svg>");
	expect(page.evaluate).toHaveBeenCalledOnce();
	expect(page.screenshot).not.toHaveBeenCalled();
});

test.each([
	{ name: "external image", url: "https://example.invalid/image.png" },
	{ name: "internal image", url: "http://127.0.0.1/private.png" },
	{ name: "local file", url: "file:///private/image.png" },
	{ name: "same-document subresource", url: "renderer", resourceType: "script" },
	{
		name: "same-document child navigation",
		url: "renderer",
		child: true,
		navigation: true,
		resourceType: "document",
	},
	{
		name: "second main navigation",
		url: "renderer",
		navigation: true,
		resourceType: "document",
		afterNavigation: true,
	},
	{ name: "document without navigation", url: "renderer", resourceType: "document" },
	{
		name: "different main navigation",
		url: "https://example.invalid/",
		navigation: true,
		resourceType: "document",
	},
])("blocks $name and closes the page and browser", async (requestCase) => {
	const { page, listeners, mainFrame } = mockPage();
	page.goto.mockImplementation(async (url: string) => {
		const documentRequest = mockRequest(url, mainFrame, true, "document");
		if (requestCase.afterNavigation) listeners.get("request")!(documentRequest);
		const blockedRequest = mockRequest(
			requestCase.url === "renderer" ? url : requestCase.url,
			requestCase.child ? {} : mainFrame,
			requestCase.navigation,
			requestCase.resourceType,
		);
		listeners.get("request")!(blockedRequest);
		if (!requestCase.afterNavigation) listeners.get("request")!(documentRequest);
		expect(documentRequest.continue).toHaveBeenCalledOnce();
		expect(blockedRequest.abort).toHaveBeenCalledExactlyOnceWith("blockedbyclient");
		expect(blockedRequest.continue).not.toHaveBeenCalled();
	});
	const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() };
	mocks.launch.mockResolvedValue(browser);
	await expect(
		new PuppeteerMermaidRenderer().captureMermaidCharts([
			{ name: "unsafe", data: "graph LR; A-->B" },
		]),
	).rejects.toThrow("blocked resource");
	expect(page.screenshot).not.toHaveBeenCalled();
	expect(page.close).toHaveBeenCalledOnce();
	expect(browser.close).toHaveBeenCalledOnce();
});

test.each(["setRequestInterception", "evaluateOnNewDocument", "goto", "evaluate"] as const)(
	"cleans up when %s fails",
	async (method) => {
		const { page } = mockPage();
		page[method].mockRejectedValueOnce(new Error("render setup failed"));
		const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() };
		mocks.launch.mockResolvedValue(browser);
		await expect(
			new PuppeteerMermaidRenderer().captureMermaidCharts([
				{ name: "first", data: "graph LR; A-->B" },
			]),
		).rejects.toThrow("render setup failed");
		expect(page.close).toHaveBeenCalledOnce();
		expect(browser.close).toHaveBeenCalledOnce();
	},
);

test("disables window.open before rendering and closes unexpected popups", async () => {
	const { page, listeners } = mockPage();
	const renderWindow = { open: vi.fn() };
	vi.stubGlobal("window", renderWindow);
	page.evaluateOnNewDocument.mockImplementation(async (install: () => void) => install());
	page.evaluate.mockImplementation(async () => {
		expect(renderWindow.open()).toBeNull();
		expect(Object.getOwnPropertyDescriptor(renderWindow, "open")).toEqual(
			expect.objectContaining({ writable: false, configurable: false }),
		);
		const popup = { close: vi.fn().mockResolvedValue(undefined) };
		listeners.get("popup")!(popup);
		expect(popup.close).toHaveBeenCalledOnce();
		expect(() => listeners.get("popup")!(null)).not.toThrow();
		return { width: 160, height: 80, svg: "<svg/>" };
	});
	mocks.launch.mockResolvedValue({ newPage: vi.fn().mockResolvedValue(page), close: vi.fn() });
	await new PuppeteerMermaidRenderer().captureMermaidCharts([
		{ name: "safe", data: "graph LR; A-->B" },
	]);
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
