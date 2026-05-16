import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { Config, ConfigProvider, Effect, Layer } from "effect";
import yargs from "yargs";
import {
	MarkdownConfluencePlatform,
	runEffect,
	RuntimeEnvironment,
	RuntimeEnvironmentService,
} from "./effects";
import { ConfluenceSettings, ConfluenceSettingsService, DEFAULT_SETTINGS } from "./Settings";

const CONFLUENCE_SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof ConfluenceSettings)[];

export const confluenceSettingsConfig = Config.all({
	confluenceBaseUrl: Config.string("confluenceBaseUrl"),
	confluenceParentId: Config.string("confluenceParentId"),
	atlassianUserName: Config.string("atlassianUserName"),
	atlassianApiToken: Config.string("atlassianApiToken"),
	folderToPublish: Config.string("folderToPublish"),
	contentRoot: Config.string("contentRoot"),
	firstHeadingPageTitle: Config.boolean("firstHeadingPageTitle"),
});

export const ConfluenceSettingsLive: Layer.Layer<
	ConfluenceSettingsService,
	Error,
	MarkdownConfluencePlatform
> = Layer.effect(ConfluenceSettingsService)(loadConfluenceSettingsEffect());

export function loadConfluenceSettings(): Promise<ConfluenceSettings> {
	return runEffect(loadConfluenceSettingsEffect());
}

export function loadConfluenceSettingsEffect(): Effect.Effect<
	ConfluenceSettings,
	Error,
	MarkdownConfluencePlatform
> {
	return Effect.gen(function* () {
		const provider = yield* makeConfluenceSettingsConfigProvider();
		return yield* parseConfluenceSettingsEffect(provider);
	});
}

export function parseConfluenceSettingsEffect(
	provider: ConfigProvider.ConfigProvider,
): Effect.Effect<ConfluenceSettings, Error, Path> {
	return confluenceSettingsConfig
		.parse(provider)
		.pipe(Effect.mapError(toError), Effect.flatMap(validateConfluenceSettingsEffect));
}

export function makeConfluenceSettingsConfigProvider(): Effect.Effect<
	ConfigProvider.ConfigProvider,
	Error,
	MarkdownConfluencePlatform
> {
	return Effect.gen(function* () {
		const fs = yield* FileSystem;
		const path = yield* Path;
		const runtimeEnvironment = yield* RuntimeEnvironmentService;
		const cwd = yield* runtimeEnvironment.cwd;
		const argv = yield* runtimeEnvironment.argv;
		const envConfigPath = yield* runtimeEnvironment.getEnv("CONFLUENCE_CONFIG_FILE");

		const configPath = yield* Effect.try({
			try: () => getConfigPath(argv, envConfigPath, cwd, path),
			catch: toError,
		});
		const configFileProvider = yield* makeConfigFileProvider(fs, configPath);
		const environmentProvider = yield* makeEnvironmentProvider(runtimeEnvironment);
		const commandLineProvider = yield* Effect.try({
			try: () => makeCommandLineProvider(argv),
			catch: toError,
		});
		const defaultProvider = ConfigProvider.fromUnknown({
			...DEFAULT_SETTINGS,
			contentRoot: cwd,
		});

		return mergeConfigProviders(
			commandLineProvider,
			environmentProvider,
			configFileProvider,
			defaultProvider,
		);
	});
}

function validateConfluenceSettingsEffect(
	settings: ConfluenceSettings,
): Effect.Effect<ConfluenceSettings, Error, Path> {
	return Effect.gen(function* () {
		const path = yield* Path;

		if (!settings.confluenceBaseUrl) {
			return yield* Effect.fail(new Error("Confluence base URL is required"));
		}

		if (!settings.confluenceParentId) {
			return yield* Effect.fail(new Error("Confluence parent ID is required"));
		}

		if (!settings.atlassianUserName) {
			return yield* Effect.fail(new Error("Atlassian user name is required"));
		}

		if (!settings.atlassianApiToken) {
			return yield* Effect.fail(new Error("Atlassian API token is required"));
		}

		if (!settings.folderToPublish) {
			return yield* Effect.fail(new Error("Folder to publish is required"));
		}

		if (!settings.contentRoot) {
			return yield* Effect.fail(new Error("Content root is required"));
		}

		return {
			...settings,
			contentRoot: settings.contentRoot.endsWith(path.sep)
				? settings.contentRoot
				: `${settings.contentRoot}${path.sep}`,
		};
	});
}

function getConfigPath(
	argv: readonly string[],
	envConfigPath: string | undefined,
	cwd: string,
	path: Path,
): string {
	return yargs([...argv])
		.option("config", {
			alias: "c",
			describe: "Path to the config file",
			type: "string",
			default: envConfigPath ?? path.join(cwd, ".markdown-confluence.json"),
			demandOption: false,
		})
		.parseSync().config;
}

function makeConfigFileProvider(
	fs: FileSystem,
	configPath: string,
): Effect.Effect<ConfigProvider.ConfigProvider, never> {
	return Effect.gen(function* () {
		const configData = yield* fs
			.readFileString(configPath, "utf-8")
			.pipe(Effect.catch(() => Effect.succeed(undefined)));

		if (!configData) {
			return ConfigProvider.fromUnknown({});
		}

		const config = yield* Effect.try({
			try: () => JSON.parse(configData) as Record<string, unknown>,
			catch: () => undefined,
		}).pipe(Effect.catch(() => Effect.succeed(undefined)));

		if (!config) {
			return ConfigProvider.fromUnknown({});
		}

		return ConfigProvider.fromUnknown(pickConfluenceSettings(config));
	});
}

function makeEnvironmentProvider(
	runtimeEnvironment: RuntimeEnvironment,
): Effect.Effect<ConfigProvider.ConfigProvider, never, never> {
	return Effect.gen(function* () {
		const firstHeadingPageTitle = yield* runtimeEnvironment.getEnv(
			"CONFLUENCE_FIRST_HEADING_PAGE_TITLE",
		);

		return ConfigProvider.fromEnv({
			env: compactRecord({
				confluenceBaseUrl: yield* runtimeEnvironment.getEnv("CONFLUENCE_BASE_URL"),
				confluenceParentId: yield* runtimeEnvironment.getEnv("CONFLUENCE_PARENT_ID"),
				atlassianUserName: yield* runtimeEnvironment.getEnv("ATLASSIAN_USERNAME"),
				atlassianApiToken: yield* runtimeEnvironment.getEnv("ATLASSIAN_API_TOKEN"),
				folderToPublish: yield* runtimeEnvironment.getEnv("FOLDER_TO_PUBLISH"),
				contentRoot: yield* runtimeEnvironment.getEnv("CONFLUENCE_CONTENT_ROOT"),
				firstHeadingPageTitle:
					firstHeadingPageTitle === "true" ? firstHeadingPageTitle : undefined,
			}),
		});
	});
}

function makeCommandLineProvider(argv: readonly string[]): ConfigProvider.ConfigProvider {
	const options = yargs([...argv])
		.usage("Usage: $0 [options]")
		.option("baseUrl", {
			alias: "b",
			describe: "Confluence base URL",
			type: "string",
			demandOption: false,
		})
		.option("parentId", {
			alias: "p",
			describe: "Confluence parent ID",
			type: "string",
			demandOption: false,
		})
		.option("userName", {
			alias: "u",
			describe: "Atlassian user name",
			type: "string",
			demandOption: false,
		})
		.option("apiToken", {
			describe: "Atlassian API token",
			type: "string",
			demandOption: false,
		})
		.option("enableFolder", {
			alias: "f",
			describe: "Folder enable to publish",
			type: "string",
			demandOption: false,
		})
		.option("contentRoot", {
			alias: "cr",
			describe:
				"Root to search for files to publish. All files must be part of this directory.",
			type: "string",
			demandOption: false,
		})
		.option("firstHeaderPageTitle", {
			alias: "fh",
			describe:
				"Replace page title with first header element when 'connie-title' isn't specified.",
			type: "boolean",
			demandOption: false,
		})
		.parseSync();

	return ConfigProvider.fromUnknown(
		compactRecord({
			confluenceBaseUrl: options.baseUrl,
			confluenceParentId: options.parentId,
			atlassianUserName: options.userName,
			atlassianApiToken: options.apiToken,
			folderToPublish: options.enableFolder,
			contentRoot: options.contentRoot,
			firstHeadingPageTitle: options.firstHeaderPageTitle ? true : undefined,
		}),
	);
}

function pickConfluenceSettings(config: Record<string, unknown>): Partial<ConfluenceSettings> {
	const result: Partial<ConfluenceSettings> = {};

	for (const key of CONFLUENCE_SETTINGS_KEYS) {
		if (!Object.prototype.hasOwnProperty.call(config, key)) {
			continue;
		}

		const value = config[key];
		if (typeof value === typeof DEFAULT_SETTINGS[key]) {
			(result as Record<string, unknown>)[key] = value;
		}
	}

	return result;
}

function compactRecord<T extends Record<string, unknown>>(record: T): Record<string, string> {
	const compacted: Record<string, string> = {};

	for (const [key, value] of Object.entries(record)) {
		if (value) {
			compacted[key] = String(value);
		}
	}

	return compacted;
}

function mergeConfigProviders(
	primary: ConfigProvider.ConfigProvider,
	...fallbacks: ConfigProvider.ConfigProvider[]
): ConfigProvider.ConfigProvider {
	return fallbacks.reduce(
		(provider, fallback) => ConfigProvider.orElse(provider, fallback),
		primary,
	);
}

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	return new Error(typeof error === "string" ? error : JSON.stringify(error));
}
