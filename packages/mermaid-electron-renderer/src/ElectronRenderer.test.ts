import { afterEach, beforeEach, expect, test, vi } from "@effect/vitest";

const mockedRenderer = {
	load: vi.fn(),
	render: vi.fn(),
	close: vi.fn(),
};

vi.doMock("@electron/remote", () => ({
	BrowserWindow: class {
		loadURL = mockedRenderer.load;
		close = mockedRenderer.close;
		setSize = vi.fn();
		webContents = {
			setZoomFactor: vi.fn(),
			executeJavaScript: async () => ({ width: 100, height: 50 }),
			capturePage: async () => ({ toPNG: () => Buffer.from("rendered image") }),
		};
	},
}));

vi.doMock("mermaid", () => ({
	default: {
		initialize: vi.fn(),
		mermaidAPI: { updateSiteConfig: vi.fn() },
		render: mockedRenderer.render,
	},
}));

const { ElectronMermaidRenderer } = await import("./index");

beforeEach(() => {
	vi.clearAllMocks();
	mockedRenderer.load.mockResolvedValue(undefined);
	mockedRenderer.render.mockResolvedValue({ svg: "<svg />" });
	vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:release-test");
	vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

test("closes the hidden window and revokes its document when loading fails", async () => {
	mockedRenderer.load.mockRejectedValueOnce(new Error("Document failed to load"));
	const renderer = new ElectronMermaidRenderer([], []);
	await expect(
		renderer.captureMermaidCharts([{ name: "chart", data: "graph TD; A-->B" }]),
	).rejects.toThrow("Document failed to load");
	expect(mockedRenderer.close).toHaveBeenCalledOnce();
	expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:release-test");
});

test("cleans up an invalid diagram and allows the same renderer to recover", async () => {
	mockedRenderer.render.mockRejectedValueOnce(new Error("Invalid diagram"));
	const renderer = new ElectronMermaidRenderer([], []);
	await expect(
		renderer.captureMermaidCharts([{ name: "invalid", data: "invalid" }]),
	).rejects.toThrow("Invalid diagram");
	expect(mockedRenderer.close).toHaveBeenCalledOnce();
	const recovered = await renderer.captureMermaidCharts([
		{ name: "valid", data: "graph TD; A-->B" },
	]);
	expect(recovered.get("valid")).toEqual(Buffer.from("rendered image"));
	expect(mockedRenderer.close).toHaveBeenCalledTimes(2);
	expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});

test("uses each renderer's current theme document and preserves Unicode CSS", async () => {
	const darkRenderer = new ElectronMermaidRenderer([], ["/* 中文 café */"], {}, "theme-dark");
	const lightRenderer = new ElectronMermaidRenderer([], [], {}, "theme-light");
	await darkRenderer.captureMermaidCharts([{ name: "dark", data: "graph TD; A-->B" }]);
	await lightRenderer.captureMermaidCharts([{ name: "light", data: "graph TD; A-->B" }]);
	const documents = vi.mocked(URL.createObjectURL).mock.calls.map(([blob]) => blob as Blob);
	expect(documents).toHaveLength(2);
	expect(await documents[0]!.text()).toContain('class="theme-dark"');
	expect(await documents[0]!.text()).toContain("中文 café");
	expect(await documents[1]!.text()).toContain('class="theme-light"');
});
