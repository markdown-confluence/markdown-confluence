import { afterEach, expect, test, vi } from "@effect/vitest";
import type { App, Command, PluginManifest, TFile } from "obsidian";
import { shouldPublishMarkdownFile } from "@markdown-confluence/lib";
import type { ObsidianPluginSettings } from "./main";

const notices: string[] = [];
const openResults = vi.fn();

class ObsidianPlugin {
	commands = new Map<string, Command>();
	statusBar = { setText: vi.fn(), empty: vi.fn(), onclick: undefined };
	constructor(public app: App) {}
	loadData = vi.fn().mockResolvedValue(undefined);
	addStatusBarItem = () => this.statusBar;
	addCommand = (command: Command) => this.commands.set(command.id, command);
	addRibbonIcon = vi.fn();
	addSettingTab = vi.fn();
}

vi.doMock("obsidian", () => ({
	Plugin: ObsidianPlugin,
	Notice: class {
		constructor(message: string) {
			notices.push(message);
		}
	},
	MarkdownView: class {},
	loadMermaid: vi.fn(),
}));
vi.doMock("./ConfluenceSettingTab", () => ({ ConfluenceSettingTab: class {} }));
vi.doMock("./CompletedModal", () => ({
	CompletedModal: class {
		open = openResults;
	},
}));
vi.doMock("./ConfluencePerPageForm", () => ({
	ConfluencePerPageForm: class {},
	mapFrontmatterToConfluencePerPageUIValues: vi.fn(),
}));
vi.doMock("./BrowserOAuth", () => ({
	BrowserOAuth: class {
		cancel = vi.fn();
	},
}));
vi.doMock("./ObsidianAuthentication", () => ({ createObsidianConfluenceClient: vi.fn() }));
vi.doMock("./effects/ObsidianPlatform", () => ({ ObsidianPlatformLive: vi.fn() }));
vi.doMock("@markdown-confluence/mermaid-electron-renderer", () => ({
	ElectronMermaidRenderer: class {},
	ElectronMathRenderer: class {},
}));
vi.doMock("@markdown-confluence/plantuml-renderer", () => ({ HttpPlantumlRenderer: class {} }));
const { default: ConfluencePlugin } = await import("./main");

afterEach(() => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
	notices.length = 0;
});

async function setup(
	filePath = "Docs/note.md",
	frontmatter: Record<string, unknown> = {},
	settings: Partial<ObsidianPluginSettings> = {},
) {
	const file = { path: filePath } as TFile;
	const processFrontMatter = vi.fn(
		async (_file: TFile, update: (values: Record<string, unknown>) => void) => {
			update(frontmatter);
		},
	);
	const app = {
		metadataCache: { getCache: () => ({ frontmatter }) },
		fileManager: { processFrontMatter },
	} as unknown as App;
	const plugin = new ConfluencePlugin(app, {} as PluginManifest);
	await plugin.loadSettings();
	Object.assign(plugin.settings, { folderToPublish: "Docs" }, settings);
	vi.spyOn(plugin, "init").mockResolvedValue(undefined);
	await plugin.onload();
	const mockPlugin = plugin as unknown as ObsidianPlugin;
	const invoke = (id: string, checking: boolean, selectedFile: TFile | null = file) =>
		mockPlugin.commands.get(id)!.editorCheckCallback!(
			checking,
			{} as never,
			{
				file: selectedFile,
			} as never,
		);
	return { plugin, mockPlugin, file, frontmatter, processFrontMatter, invoke };
}

test.each([
	{
		name: "a matching publish tag outside the folder",
		path: "Notes/tagged.md",
		frontmatter: { tags: ["public"] },
		settings: { tagsToPublish: "public" },
	},
	{
		name: "the root publish folder",
		path: "Notes/root.md",
		frontmatter: {},
		settings: { folderToPublish: "." },
	},
	{
		name: "an explicit opt-in outside the folder",
		path: "Notes/explicit.md",
		frontmatter: { "connie-publish": true },
		settings: {},
	},
])("disable persists an opt-out for $name", async ({ path, frontmatter, settings }) => {
	const fixture = await setup(path, frontmatter, settings);
	expect(fixture.invoke("disable-publishing", true)).toBe(true);
	expect(fixture.processFrontMatter).not.toHaveBeenCalled();
	expect(fixture.invoke("disable-publishing", false)).toBe(true);
	await fixture.processFrontMatter.mock.results[0].value;
	expect(frontmatter["connie-publish"]).toBe(false);
	expect(shouldPublishMarkdownFile(path, frontmatter, fixture.plugin.settings)).toBe(false);
	expect(fixture.invoke("disable-publishing", true)).toBe(false);
});

test.each([
	{ path: "Docs-private/note.md", frontmatter: {} },
	{ path: "Docs/note.md", frontmatter: { "connie-publish": false } },
])("enable persists an opt-in for $path", async ({ path, frontmatter }) => {
	const fixture = await setup(path, frontmatter);
	expect(fixture.invoke("enable-publishing", true)).toBe(true);
	expect(fixture.processFrontMatter).not.toHaveBeenCalled();
	expect(fixture.invoke("enable-publishing", false)).toBe(true);
	await fixture.processFrontMatter.mock.results[0].value;
	expect(frontmatter["connie-publish"]).toBe(true);
	expect(shouldPublishMarkdownFile(path, frontmatter, fixture.plugin.settings)).toBe(true);
	expect(fixture.invoke("enable-publishing", true)).toBe(false);
});

test("exclusions and a missing file cannot be enabled or disabled", async () => {
	const fixture = await setup("Docs/Private/note.md", {}, { foldersToExclude: ["Docs/Private"] });
	for (const command of ["enable-publishing", "disable-publishing"]) {
		for (const checking of [true, false]) {
			expect(fixture.invoke(command, checking)).toBe(false);
			expect(fixture.invoke(command, checking, null)).toBe(false);
		}
	}
	expect(fixture.processFrontMatter).not.toHaveBeenCalled();
});

test("execution rechecks publication policy after a command becomes available", async () => {
	const fixture = await setup("Notes/note.md");
	expect(fixture.invoke("enable-publishing", true)).toBe(true);
	fixture.plugin.settings.foldersToExclude = ["Notes"];
	expect(fixture.invoke("enable-publishing", false)).toBe(false);
	expect(fixture.processFrontMatter).not.toHaveBeenCalled();
});

test("frontmatter write failures produce a notice", async () => {
	const fixture = await setup();
	fixture.processFrontMatter.mockRejectedValue(new Error("Vault is read-only"));
	expect(fixture.invoke("disable-publishing", false)).toBe(true);
	await Promise.resolve();
	expect(notices).toEqual(["Could not update publishing: Vault is read-only"]);
});

test.each([false, true])(
	"unload cancels publishing and suppresses late UI (failure: %s)",
	async (fails) => {
		const fixture = await setup();
		const result = Promise.withResolvers<Awaited<ReturnType<ConfluencePlugin["doPublish"]>>>();
		vi.spyOn(fixture.plugin, "doPublish").mockReturnValue(result.promise);
		const publishing = fixture.plugin as unknown as {
			runPublish(): Promise<void>;
			publishAbort: AbortController | undefined;
		};
		const completion = publishing.runPublish();
		const signal = publishing.publishAbort!.signal;
		await fixture.plugin.onunload();
		expect(signal.aborted).toBe(true);
		expect(fixture.plugin.browserOAuth.cancel).toHaveBeenCalledOnce();
		if (fails) result.reject(new Error("Request cancelled"));
		else result.resolve({ errorMessage: null, failedFiles: [], filesUploadResult: [] });
		await completion;
		expect(openResults).not.toHaveBeenCalled();
		expect(notices).toEqual([]);
		expect(fixture.mockPlugin.statusBar.empty).not.toHaveBeenCalled();
		expect(fixture.invoke("disable-publishing", false)).toBe(false);
		await publishing.runPublish();
		expect(fixture.plugin.doPublish).toHaveBeenCalledOnce();
	},
);
