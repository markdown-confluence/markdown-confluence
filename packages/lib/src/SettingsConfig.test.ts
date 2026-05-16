import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { afterEach, expect, test } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { loadConfluenceSettingsEffect, parseConfluenceSettingsEffect } from "./SettingsConfig";
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
					folderToPublish: "file-folder",
					contentRoot: "file-root",
					firstHeadingPageTitle: true,
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
			"--contentRoot",
			"cli-root",
		],
		cwd: tmpRoot ?? ".",
		env: {
			CONFLUENCE_BASE_URL: "https://env.example.atlassian.net",
			ATLASSIAN_USERNAME: "env-user@example.com",
			FOLDER_TO_PUBLISH: "env-folder",
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
		confluenceBaseUrl: "https://env.example.atlassian.net",
		confluenceParentId: "cli-parent",
		atlassianUserName: "env-user@example.com",
		atlassianApiToken: "cli-token",
		folderToPublish: "env-folder",
		contentRoot: expectedCliContentRoot,
		firstHeadingPageTitle: true,
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
					folderToPublish: "file-folder",
					contentRoot,
					firstHeadingPageTitle: false,
				}),
			);

			return {
				settings,
				expectedContentRoot: `${contentRoot}${path.sep}`,
			};
		}),
	);

	expect(settings.firstHeadingPageTitle).toBe(false);
	expect(settings.contentRoot).toBe(expectedContentRoot);
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
