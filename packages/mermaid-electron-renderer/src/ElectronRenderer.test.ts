import { afterEach, beforeEach, expect, test, vi } from "@effect/vitest";

const mockedRenderer = {
	load: vi.fn(),
	execute: vi.fn(),
	close: vi.fn(),
	create: vi.fn(),
	requests: vi.fn(),
	permissions: vi.fn(),
	permissionCheck: vi.fn(),
	clear: vi.fn(),
	connections: vi.fn(),
	partition: vi.fn(),
	open: vi.fn(),
	events: vi.fn(),
};
const renderSession = {
	webRequest: { onBeforeRequest: mockedRenderer.requests },
	setPermissionRequestHandler: mockedRenderer.permissions,
	setPermissionCheckHandler: mockedRenderer.permissionCheck,
	clearStorageData: mockedRenderer.clear,
	closeAllConnections: mockedRenderer.connections,
};

vi.doMock("@electron/remote", () => ({
	session: { fromPartition: mockedRenderer.partition },
	BrowserWindow: class {
		constructor(options: unknown) {
			mockedRenderer.create(options);
		}
		loadURL = mockedRenderer.load;
		close = mockedRenderer.close;
		setSize = vi.fn();
		webContents = {
			setZoomFactor: vi.fn(),
			executeJavaScript: mockedRenderer.execute,
			setWindowOpenHandler: mockedRenderer.open,
			on: mockedRenderer.events,
			capturePage: async () => ({ toPNG: () => Buffer.from("rendered image") }),
		};
	},
}));
vi.doMock("./mermaidRuntime", () => ({
	isolatedMermaidRuntime: () => "/* isolated browser runtime */",
}));
// Any runtime Mermaid import in the host is a regression.
vi.doMock("mermaid", () => {
	throw new Error("Mermaid must never execute in the host");
});
const { ElectronMermaidRenderer } = await import("./index");

beforeEach(() => {
	vi.clearAllMocks();
	mockedRenderer.partition.mockReturnValue(renderSession);
	mockedRenderer.load.mockResolvedValue(undefined);
	mockedRenderer.execute.mockResolvedValue({ width: 100, height: 50, svg: "<svg />" });
});
afterEach(() => vi.restoreAllMocks());

test("closes the hidden window and clears its isolated session when loading fails", async () => {
	mockedRenderer.load.mockRejectedValueOnce(new Error("Document failed to load"));
	await expect(
		new ElectronMermaidRenderer([], []).captureMermaidCharts([
			{ name: "chart", data: "graph TD; A-->B" },
		]),
	).rejects.toThrow("Document failed to load");
	expect(mockedRenderer.close).toHaveBeenCalledOnce();
	expect(mockedRenderer.clear).toHaveBeenCalledOnce();
	expect(mockedRenderer.requests).toHaveBeenLastCalledWith(null);
});

test("cleans up an invalid diagram and allows the same renderer to recover", async () => {
	mockedRenderer.execute
		.mockResolvedValueOnce(undefined)
		.mockRejectedValueOnce(new Error("Invalid diagram"));
	const renderer = new ElectronMermaidRenderer([], []);
	await expect(
		renderer.captureMermaidCharts([{ name: "invalid", data: "invalid" }]),
	).rejects.toThrow("Invalid diagram");
	const recovered = await renderer.captureMermaidCharts([
		{ name: "valid", data: "graph TD; A-->B" },
	]);
	expect(recovered.get("valid")).toEqual(Buffer.from("rendered image"));
	expect(mockedRenderer.close).toHaveBeenCalledTimes(2);
	expect(mockedRenderer.clear).toHaveBeenCalledTimes(2);
});

test("keeps theme and Unicode CSS inline under a resource-denying CSP", async () => {
	const darkRenderer = new ElectronMermaidRenderer([], ["/* 中文 café */"], {}, "theme-dark");
	const lightRenderer = new ElectronMermaidRenderer([], [], {}, "theme-light");
	await darkRenderer.captureMermaidCharts([{ name: "dark", data: "graph TD; A-->B" }]);
	await lightRenderer.captureMermaidCharts([{ name: "light", data: "graph TD; A-->B" }]);
	const documents = mockedRenderer.load.mock.calls.map(([url]) =>
		decodeURIComponent(url.split(",")[1]),
	);
	expect(documents[0]).toContain('class="theme-dark"');
	expect(documents[0]).toContain("中文 café");
	expect(documents[1]).toContain('class="theme-light"');
	expect(documents[0]).toContain("script-src 'none'");
	expect(documents[0]).toContain("img-src 'none'");
	expect(documents[0]).toContain("connect-src 'none'");
});

test("installs all restrictions before document loading and renders SVG only in the sandbox", async () => {
	const renderer = new ElectronMermaidRenderer([], [], {}, "", {
		format: "svg",
		theme: "base",
		themeVariables: { primaryColor: "#ddebff" },
	});
	const charts = await renderer.captureMermaidCharts([
		{ name: "chart", data: "graph TD; A-->B" },
	]);
	expect(mockedRenderer.create).toHaveBeenCalledWith(
		expect.objectContaining({
			webPreferences: expect.objectContaining({
				session: renderSession,
				sandbox: true,
				nodeIntegration: false,
				contextIsolation: true,
			}),
		}),
	);
	expect(mockedRenderer.partition).toHaveBeenCalledWith(expect.stringMatching(/^mermaid-/u), {
		cache: false,
	});
	expect(mockedRenderer.requests.mock.invocationCallOrder[0]).toBeLessThan(
		mockedRenderer.load.mock.invocationCallOrder[0]!,
	);
	expect(mockedRenderer.open.mock.invocationCallOrder[0]).toBeLessThan(
		mockedRenderer.load.mock.invocationCallOrder[0]!,
	);
	expect(mockedRenderer.execute).toHaveBeenNthCalledWith(1, "/* isolated browser runtime */");
	expect(mockedRenderer.execute.mock.calls[1]?.[0]).toContain('"securityLevel":"strict"');
	expect(charts.get("chart")?.toString()).toBe("<svg />");
	expect(mockedRenderer.close).toHaveBeenCalledOnce();
	const [intercept] = mockedRenderer.requests.mock.calls[0]!;
	for (const url of [
		"http://127.0.0.1/image",
		"https://example.org",
		"file:///tmp/secret",
		"app://obsidian.md/app.css",
		"data:image/svg+xml,test",
	]) {
		const respond = vi.fn();
		intercept({ url, resourceType: "image" }, respond);
		expect(respond).toHaveBeenCalledWith({ cancel: true });
	}
	expect(mockedRenderer.open.mock.calls[0]![0]()).toEqual({ action: "deny" });
});

test("rejects linked stylesheets and prevents CSS or body attributes escaping the document", async () => {
	await expect(
		new ElectronMermaidRenderer(["https://example.org/theme.css"], []).captureMermaidCharts([
			{ name: "chart", data: "graph TD; A-->B" },
		]),
	).rejects.toThrow("External Mermaid stylesheets are disabled");
	const document = await new ElectronMermaidRenderer([], [])
		.getFileContentBlob([], ["</style><img src='https://example.org'>"], '" onload="bad')
		.text();
	expect(document).not.toContain("<img");
	expect(document).toContain("&quot; onload=&quot;bad");
	expect(mockedRenderer.create).not.toHaveBeenCalled();
});

test("does not allocate a window or session for empty input", async () => {
	expect((await new ElectronMermaidRenderer([], []).captureMermaidCharts([])).size).toBe(0);
	expect(mockedRenderer.partition).not.toHaveBeenCalled();
});
