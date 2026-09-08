import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { afterEach, expect, test } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import {
	loadConfluenceSettingsEffect,
	parseConfluenceCommandLineOptions,
	parseConfluenceSettingsEffect,
} from "./SettingsConfig";
import { DEFAULT_SETTINGS, type ConfluenceSettings, validateConfluenceSettings } from "./Settings";
import { RuntimeEnvironment, RuntimeEnvironmentService, runEffect } from "./effects";

let tmpRoot: string | undefined;

afterEach(async () => {
	await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;

			if (tmpRoot) {
				yield* fs.remove(tmpRoot, { recursive: true, force: true });
				tmpRoot = undefined;
			}
		}),
	);
});

test("loads settings from Effect ConfigProviders with CLI, env, file, default precedence", async () => {
	const { configPath, expectedCliContentRoot } = await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;

			tmpRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-settings-" });
			const filePath = path.join(tmpRoot, ".markdown-confluence.json");

			yield* fs.writeFileString(
				filePath,
				JSON.stringify({
					confluenceBaseUrl: "https://file.example.atlassian.net",
					confluenceParentId: "file-parent",
					atlassianUserName: "file-user@example.com",
					atlassianApiToken: "file-token",
					confluenceAuthType: "basic",
					confluenceApiPrefix: "/file/rest",
					confluenceRequestHeaders: {
						"X-File-Header": "file-value",
					},
					folderToPublish: "file-folder",
					tagsToPublish: "file-tag",
					contentRoot: "file-root",
					firstHeadingPageTitle: true,
					forceOverwrite: false,
					pageHeaderMarkdown: "File header",
					pageFooterMarkdown: "File footer",
					ignoredCodeBlockLanguages: ["dataview"],
				}),
			);

			return {
				configPath: filePath,
				expectedCliContentRoot: `cli-root${path.sep}`,
			};
		}),
	);

	const runtimeEnvironment = makeRuntimeEnvironment({
		argv: [
			"node",
			"markdown-confluence",
			"--config",
			configPath,
			"--parentId",
			"cli-parent",
			"--apiToken",
			"cli-token",
			"--authType",
			"bearer",
			"--apiPrefix",
			"cli-rest",
			"--requestHeaders",
			"X-Cli-Header=cli-value",
			"--contentRoot",
			"cli-root",
		],
		cwd: tmpRoot ?? ".",
		env: {
			CONFLUENCE_BASE_URL: "https://env.example.atlassian.net",
			ATLASSIAN_USERNAME: "env-user@example.com",
			CONFLUENCE_API_PREFIX: "/env/rest",
			FOLDER_TO_PUBLISH: "env-folder",
			CONFLUENCE_FORCE_OVERWRITE: "true",
			CONFLUENCE_TAGS_TO_PUBLISH: "env-tag",
			CONFLUENCE_PAGE_HEADER_MARKDOWN: "Env header",
		},
	});

	const settings = await Effect.runPromise(
		loadConfluenceSettingsEffect().pipe(
			Effect.provide(
				Layer.mergeAll(
					NodeFileSystem.layer,
					NodePath.layer,
					Layer.succeed(RuntimeEnvironmentService, runtimeEnvironment),
				),
			),
		),
	);

	expect(settings).toEqual({
		...DEFAULT_SETTINGS,
		confluenceBaseUrl: "https://env.example.atlassian.net",
		confluenceParentId: "cli-parent",
		atlassianUserName: "env-user@example.com",
		atlassianApiToken: "cli-token",
		confluenceAuthType: "bearer",
		confluenceApiPrefix: "cli-rest",
		confluenceRequestHeaders: {
			"X-Cli-Header": "cli-value",
		},
		folderToPublish: "env-folder",
		tagsToPublish: "env-tag",
		contentRoot: expectedCliContentRoot,
		firstHeadingPageTitle: true,
		forceOverwrite: true,
		pageHeaderMarkdown: "Env header",
		pageFooterMarkdown: "File footer",
		ignoredCodeBlockLanguages: ["dataview"],
	});
});

test("keeps explicit false values from config providers", async () => {
	const { settings, expectedContentRoot } = await runEffect(
		Effect.gen(function* () {
			const path = yield* Path;
			const contentRoot = "docs";
			const settings = yield* parseConfluenceSettingsEffect(
				ConfigProvider.fromUnknown({
					confluenceBaseUrl: "https://file.example.atlassian.net",
					confluenceParentId: "file-parent",
					atlassianUserName: "file-user@example.com",
					atlassianApiToken: "file-token",
					confluenceAuthType: "basic",
					confluenceApiPrefix: "/wiki/rest",
					confluenceRequestHeaders: {},
					folderToPublish: "file-folder",
					tagsToPublish: "",
					contentRoot,
					firstHeadingPageTitle: false,
					forceOverwrite: false,
					pageHeaderMarkdown: "",
					pageFooterMarkdown: "",
					ignoredCodeBlockLanguages: [],
				}),
			);

			return {
				settings,
				expectedContentRoot: `${contentRoot}${path.sep}`,
			};
		}),
	);

	expect(settings.firstHeadingPageTitle).toBe(false);
	expect(settings.forceOverwrite).toBe(false);
	expect(settings.contentRoot).toBe(expectedContentRoot);
});

test("allows bearer auth without an Atlassian user name", async () => {
	const settings = await runEffect(
		parseConfluenceSettingsEffect(
			ConfigProvider.fromUnknown({
				confluenceBaseUrl: "https://file.example.atlassian.net",
				confluenceParentId: "file-parent",
				atlassianUserName: "",
				atlassianApiToken: "personal-access-token",
				confluenceAuthType: "bearer",
				confluenceApiPrefix: "/rest",
				confluenceRequestHeaders: {},
				folderToPublish: "file-folder",
				contentRoot: "docs",
				firstHeadingPageTitle: false,
			}),
		),
	);

	expect(settings.confluenceAuthType).toBe("bearer");
	expect(settings.atlassianUserName).toBe("");
});

test("parses boolean CLI values passed as separate arguments", async () => {
	const { settings, expectedContentRoot } = await runEffect(
		Effect.gen(function* () {
			const path = yield* Path;
			const contentRoot = "docs";
			const runtimeEnvironment = makeRuntimeEnvironment({
				argv: [
					"node",
					"markdown-confluence",
					"--baseUrl",
					"https://cli.example.atlassian.net",
					"--parentId",
					"cli-parent",
					"--userName",
					"cli-user@example.com",
					"--apiToken",
					"cli-token",
					"--enableFolder",
					"docs",
					"--tagsToPublish",
					"public,docs",
					"--contentRoot",
					contentRoot,
					"--fh",
					"false",
					"--forceOverwrite",
					"false",
					"--pageFooterMarkdown",
					"CLI footer",
				],
				cwd: ".",
				env: {},
			});
			const settings = yield* loadConfluenceSettingsEffect().pipe(
				Effect.provide(
					Layer.mergeAll(
						NodeFileSystem.layer,
						NodePath.layer,
						Layer.succeed(RuntimeEnvironmentService, runtimeEnvironment),
					),
				),
			);

			return {
				settings,
				expectedContentRoot: `${contentRoot}${path.sep}`,
			};
		}),
	);

	expect(settings.firstHeadingPageTitle).toBe(false);
	expect(settings.forceOverwrite).toBe(false);
	expect(settings.tagsToPublish).toBe("public,docs");
	expect(settings.pageFooterMarkdown).toBe("CLI footer");
	expect(settings.contentRoot).toBe(expectedContentRoot);
});

test("accepts only recognized boolean literals in both CLI value forms", () => {
	for (const [literal, expected] of [
		["true", true],
		["TRUE", true],
		["1", true],
		["yes", true],
		["on", true],
		["false", false],
		["FALSE", false],
		["0", false],
		["no", false],
		["off", false],
	] as const) {
		for (const args of [[`--forceOverwrite=${literal}`], ["--fo", literal]])
			expect(parseConfluenceCommandLineOptions(args)["forceOverwrite"]).toBe(expected);
	}
	expect(parseConfluenceCommandLineOptions(["-fo"])["forceOverwrite"]).toBe(true);
});

test.each([
	{ args: ["--forceOverwrite=fales"], error: "--forceOverwrite requires a boolean value" },
	{ args: ["--forceOverwrite", "fales"], error: "--forceOverwrite requires a boolean value" },
	{ args: ["--forceOverwrite="], error: "--forceOverwrite requires a boolean value" },
	{ args: ["--parentId"], error: "--parentId requires a value" },
	{ args: ["--parentId", "--forceOverwrite"], error: "--parentId requires a value" },
	{ args: ["--parentId="], error: "--parentId requires a value" },
	{ args: ["--parentId", "-123"], error: "--parentId requires a value" },
	{ args: ["--config"], error: "--config requires a value" },
])(
	"rejects malformed CLI values $args despite valid fallback settings",
	async ({ args, error }) => {
		const runtimeEnvironment = makeRuntimeEnvironment({
			argv: ["node", "markdown-confluence", ...args],
			cwd: "/settings-test",
			env: {
				CONFLUENCE_BASE_URL: "https://example.atlassian.net",
				CONFLUENCE_PARENT_ID: "fallback-parent",
				ATLASSIAN_USERNAME: "test@example.com",
				ATLASSIAN_API_TOKEN: "test-token",
				CONFLUENCE_FORCE_OVERWRITE: "false",
			},
		});
		await expect(
			Effect.runPromise(
				loadConfluenceSettingsEffect().pipe(
					Effect.provide(
						Layer.mergeAll(
							NodeFileSystem.layer,
							NodePath.layer,
							Layer.succeed(RuntimeEnvironmentService, runtimeEnvironment),
						),
					),
				),
			),
		).rejects.toThrow(error);
	},
);

test("keeps inline strings beginning with a dash and existing CLI aliases", () => {
	expect(
		parseConfluenceCommandLineOptions([
			"-b=https://example.atlassian.net",
			"--p=123",
			"--fh=false",
			"-cr",
			"docs",
			"--pageHeaderMarkdown=- Published note",
		]),
	).toEqual({
		baseUrl: "https://example.atlassian.net",
		parentId: "123",
		firstHeaderPageTitle: false,
		contentRoot: "docs",
		pageHeaderMarkdown: "- Published note",
	});
});

test("reports shared settings validation issues", () => {
	const validationResult = validateConfluenceSettings({
		...validSettings,
		confluenceBaseUrl: "https://example.atlassian.net/",
		atlassianApiToken: " ",
	});

	expect(validationResult).toEqual({
		valid: false,
		issues: [
			{
				field: "atlassianApiToken",
				message: "Atlassian API token is required",
			},
			{
				field: "confluenceBaseUrl",
				message: "Confluence base URL must not end with a slash",
			},
		],
	});
});

test("rejects invalid settings from config providers", async () => {
	await expect(
		runEffect(
			parseConfluenceSettingsEffect(
				ConfigProvider.fromUnknown({
					...validSettings,
					confluenceBaseUrl: "https://example.atlassian.net/",
				}),
			),
		),
	).rejects.toThrow("Confluence base URL must not end with a slash");
});

function makeRuntimeEnvironment({
	argv,
	cwd,
	env,
}: {
	argv: readonly string[];
	cwd: string;
	env: Record<string, string | undefined>;
}): RuntimeEnvironment {
	return {
		cwd: Effect.succeed(cwd),
		chdir: () => Effect.void,
		argv: Effect.succeed(argv),
		getEnv: (name) => Effect.succeed(env[name]),
		setMaxListeners: () => Effect.void,
		exit: (code) => Effect.die(new Error(`Unexpected exit ${code}`)) as Effect.Effect<never>,
	};
}

const validSettings: ConfluenceSettings = {
	...DEFAULT_SETTINGS,
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceParentId: "file-parent",
	atlassianUserName: "file-user@example.com",
	atlassianApiToken: "file-token",
	folderToPublish: "file-folder",
	contentRoot: "docs",
	firstHeadingPageTitle: false,
};

test("accepts a large Mermaid timeout and rejects a nonpositive timeout", async () => {
	const parse = (mermaidProtocolTimeout: number) =>
		runEffect(
			parseConfluenceSettingsEffect(
				ConfigProvider.fromUnknown({ ...validSettings, mermaidProtocolTimeout }),
			),
		);
	expect((await parse(600_000)).mermaidProtocolTimeout).toBe(600_000);
	await expect(parse(0)).rejects.toThrow("Mermaid protocol timeout");
});

test("loads OAuth client-credentials settings and leaves basic credentials optional", async () => {
	const settings = await runEffect(
		parseConfluenceSettingsEffect(
			ConfigProvider.fromUnknown({
				confluenceBaseUrl: "https://api.atlassian.com/ex/confluence/cloud-id",
				confluenceSiteUrl: "https://site.example.atlassian.net",
				confluenceParentId: "parent",
				confluenceAuthType: "oauth2",
				atlassianClientId: "client-id",
				atlassianClientSecret: "client-secret",
				folderToPublish: "docs",
				contentRoot: "docs",
				firstHeadingPageTitle: false,
			}),
		),
	);

	expect(settings.confluenceAuthType).toBe("oauth2");
	expect(settings.atlassianClientId).toBe("client-id");
	expect(settings.atlassianClientSecret).toBe("client-secret");
	expect(settings.confluenceSiteUrl).toBe("https://site.example.atlassian.net");
	expect(settings.atlassianUserName).toBe("");
	expect(settings.atlassianApiToken).toBe("");
});

test("defaults confluenceAuthType to basic and confluenceSiteUrl to empty string", async () => {
	const settings = await runEffect(
		parseConfluenceSettingsEffect(
			ConfigProvider.fromUnknown({
				confluenceBaseUrl: "https://site.example.atlassian.net",
				confluenceParentId: "parent",
				atlassianUserName: "user@example.com",
				atlassianApiToken: "token",
				folderToPublish: "docs",
				contentRoot: "docs",
				firstHeadingPageTitle: false,
			}),
		),
	);

	expect(settings.confluenceAuthType).toBe("basic");
	expect(settings.confluenceSiteUrl).toBe("");
});

test("fails when basic auth is missing the API token", async () => {
	await expect(
		runEffect(
			parseConfluenceSettingsEffect(
				ConfigProvider.fromUnknown({
					confluenceBaseUrl: "https://site.example.atlassian.net",
					confluenceParentId: "parent",
					confluenceAuthType: "basic",
					atlassianUserName: "user@example.com",
					folderToPublish: "docs",
					contentRoot: "docs",
					firstHeadingPageTitle: false,
				}),
			),
		),
	).rejects.toThrow(/Atlassian API token is required/);
});

test("fails when oauth2 auth is missing the client secret", async () => {
	await expect(
		runEffect(
			parseConfluenceSettingsEffect(
				ConfigProvider.fromUnknown({
					confluenceBaseUrl: "https://api.atlassian.com/ex/confluence/cloud-id",
					confluenceParentId: "parent",
					confluenceAuthType: "oauth2",
					atlassianClientId: "client-id",
					folderToPublish: "docs",
					contentRoot: "docs",
					firstHeadingPageTitle: false,
				}),
			),
		),
	).rejects.toThrow(/Atlassian client secret is required when confluenceAuthType is oauth2/);
});

test("requires confluenceSiteUrl when confluenceBaseUrl is the Atlassian API gateway", async () => {
	await expect(
		runEffect(
			parseConfluenceSettingsEffect(
				ConfigProvider.fromUnknown({
					confluenceBaseUrl: "https://api.atlassian.com/ex/confluence/cloud-id",
					confluenceParentId: "parent",
					confluenceAuthType: "oauth2",
					atlassianClientId: "client-id",
					atlassianClientSecret: "client-secret",
					folderToPublish: "docs",
					contentRoot: "docs",
					firstHeadingPageTitle: false,
				}),
			),
		),
	).rejects.toThrow(
		/Confluence site URL is required when confluenceBaseUrl points at the Atlassian API gateway/,
	);
});

test("accepts the Atlassian API gateway base URL when confluenceSiteUrl is provided", async () => {
	const settings = await runEffect(
		parseConfluenceSettingsEffect(
			ConfigProvider.fromUnknown({
				confluenceBaseUrl: "https://api.atlassian.com/ex/confluence/cloud-id",
				confluenceSiteUrl: "https://site.example.atlassian.net",
				confluenceParentId: "parent",
				confluenceAuthType: "oauth2",
				atlassianClientId: "client-id",
				atlassianClientSecret: "client-secret",
				folderToPublish: "docs",
				contentRoot: "docs",
				firstHeadingPageTitle: false,
			}),
		),
	);

	expect(settings.confluenceSiteUrl).toBe("https://site.example.atlassian.net");
});

test("rejects an unsupported confluenceAuthType value", async () => {
	await expect(
		runEffect(
			parseConfluenceSettingsEffect(
				ConfigProvider.fromUnknown({
					confluenceBaseUrl: "https://site.example.atlassian.net",
					confluenceParentId: "parent",
					confluenceAuthType: "saml",
					atlassianUserName: "user@example.com",
					atlassianApiToken: "token",
					folderToPublish: "docs",
					contentRoot: "docs",
					firstHeadingPageTitle: false,
				}),
			),
		),
	).rejects.toThrow(/saml/);
});

test("loads nested plantuml settings with CLI > env > file > default precedence", async () => {
	const { configPath } = await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;

			tmpRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-settings-" });
			const filePath = path.join(tmpRoot, ".markdown-confluence.json");

			yield* fs.writeFileString(
				filePath,
				JSON.stringify({
					confluenceBaseUrl: "https://file.example.atlassian.net",
					confluenceParentId: "file-parent",
					atlassianUserName: "file-user@example.com",
					atlassianApiToken: "file-token",
					folderToPublish: "file-folder",
					contentRoot: "file-root",
					firstHeadingPageTitle: true,
					plantuml: {
						enabled: false,
						serverUrl: "https://file-plantuml.example.com",
					},
				}),
			);

			return { configPath: filePath };
		}),
	);

	const runtimeEnvironment = makeRuntimeEnvironment({
		argv: [
			"node",
			"markdown-confluence",
			"--config",
			configPath,
			"--plantumlServerUrl",
			"https://cli-plantuml.example.com",
		],
		cwd: tmpRoot ?? ".",
		env: {
			CONFLUENCE_PLANTUML_ENABLED: "true",
		},
	});

	const settings = await Effect.runPromise(
		loadConfluenceSettingsEffect().pipe(
			Effect.provide(
				Layer.mergeAll(
					NodeFileSystem.layer,
					NodePath.layer,
					Layer.succeed(RuntimeEnvironmentService, runtimeEnvironment),
				),
			),
		),
	);

	// serverUrl from CLI (highest precedence with a value), enabled from env.
	expect(settings.plantuml).toEqual({
		enabled: true,
		serverUrl: "https://cli-plantuml.example.com",
	});
});

test("falls back to default plantuml settings when nothing is configured", async () => {
	const settings = await runEffect(
		parseConfluenceSettingsEffect(
			ConfigProvider.fromUnknown({
				confluenceBaseUrl: "https://file.example.atlassian.net",
				confluenceParentId: "file-parent",
				atlassianUserName: "file-user@example.com",
				atlassianApiToken: "file-token",
				folderToPublish: "file-folder",
				contentRoot: "docs",
				firstHeadingPageTitle: false,
			}),
		),
	);

	expect(settings.plantuml).toEqual({
		enabled: false,
		serverUrl: "",
	});
});

test("loads nested kroki settings with CLI > env > file > default precedence", async () => {
	const { configPath } = await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;

			tmpRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-settings-" });
			const filePath = path.join(tmpRoot, ".markdown-confluence.json");

			yield* fs.writeFileString(
				filePath,
				JSON.stringify({
					confluenceBaseUrl: "https://file.example.atlassian.net",
					confluenceParentId: "file-parent",
					atlassianUserName: "file-user@example.com",
					atlassianApiToken: "file-token",
					folderToPublish: "file-folder",
					contentRoot: "file-root",
					firstHeadingPageTitle: true,
					kroki: {
						enabled: false,
						serverUrl: "https://file-kroki.example.com",
					},
				}),
			);

			return { configPath: filePath };
		}),
	);

	const runtimeEnvironment = makeRuntimeEnvironment({
		argv: [
			"node",
			"markdown-confluence",
			"--config",
			configPath,
			"--krokiServerUrl",
			"https://cli-kroki.example.com",
		],
		cwd: tmpRoot ?? ".",
		env: {
			CONFLUENCE_KROKI_ENABLED: "true",
		},
	});

	const settings = await Effect.runPromise(
		loadConfluenceSettingsEffect().pipe(
			Effect.provide(
				Layer.mergeAll(
					NodeFileSystem.layer,
					NodePath.layer,
					Layer.succeed(RuntimeEnvironmentService, runtimeEnvironment),
				),
			),
		),
	);

	// serverUrl from CLI (highest precedence with a value), enabled from env.
	expect(settings.kroki).toEqual({
		enabled: true,
		serverUrl: "https://cli-kroki.example.com",
		format: "png",
		timeoutMs: 30000,
	});
});
