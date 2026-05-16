import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { Config, ConfigProvider, Effect, Layer } from "effect";
import {
	MarkdownConfluencePlatform,
	runEffect,
	RuntimeEnvironment,
	RuntimeEnvironmentService,
} from "./effects";
import { ConfluenceSettings, ConfluenceSettingsService, DEFAULT_SETTINGS } from "./Settings";

const CONFLUENCE_SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof ConfluenceSettings)[];

type ArgumentDefinition = {
	name: string;
	aliases?: string[];
	type: "boolean" | "string";
};

type ArgumentValue = boolean | string | undefined;

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
	const options = parseArgumentValues(argv, [{ name: "config", aliases: ["c"], type: "string" }]);
	const config = options["config"];

	return typeof config === "string"
		? config
		: (envConfigPath ?? path.join(cwd, ".markdown-confluence.json"));
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
	const options = parseArgumentValues(argv, [
		{ name: "baseUrl", aliases: ["b"], type: "string" },
		{ name: "parentId", aliases: ["p"], type: "string" },
		{ name: "userName", aliases: ["u"], type: "string" },
		{ name: "apiToken", type: "string" },
		{ name: "enableFolder", aliases: ["f"], type: "string" },
		{ name: "contentRoot", aliases: ["cr"], type: "string" },
		{ name: "firstHeaderPageTitle", aliases: ["fh"], type: "boolean" },
	]);

	return ConfigProvider.fromUnknown(
		compactRecord({
			confluenceBaseUrl: options["baseUrl"],
			confluenceParentId: options["parentId"],
			atlassianUserName: options["userName"],
			atlassianApiToken: options["apiToken"],
			folderToPublish: options["enableFolder"],
			contentRoot: options["contentRoot"],
			firstHeadingPageTitle: options["firstHeaderPageTitle"],
		}),
	);
}

function parseArgumentValues(
	argv: readonly string[],
	definitions: ArgumentDefinition[],
): Record<string, ArgumentValue> {
	const definitionsByFlag = new Map<string, ArgumentDefinition>();

	for (const definition of definitions) {
		definitionsByFlag.set(`--${definition.name}`, definition);
		for (const alias of definition.aliases ?? []) {
			definitionsByFlag.set(`--${alias}`, definition);
			definitionsByFlag.set(`-${alias}`, definition);
		}
	}

	const parsed: Record<string, ArgumentValue> = {};
	for (let index = 2; index < argv.length; index += 1) {
		const rawArgument = argv[index];
		if (!rawArgument || rawArgument === "--") {
			break;
		}

		const equalsIndex = rawArgument.indexOf("=");
		const flag = equalsIndex >= 0 ? rawArgument.slice(0, equalsIndex) : rawArgument;
		const inlineValue = equalsIndex >= 0 ? rawArgument.slice(equalsIndex + 1) : undefined;
		const definition = definitionsByFlag.get(flag);
		if (!definition) {
			continue;
		}

		if (definition.type === "boolean") {
			const nextValue = inlineValue === undefined ? argv[index + 1] : undefined;
			const usesSeparateValue =
				inlineValue === undefined && nextValue !== undefined && !nextValue.startsWith("-");

			parsed[definition.name] = parseBooleanArgument(
				inlineValue ?? (usesSeparateValue ? nextValue : undefined),
			);
			if (usesSeparateValue) {
				index += 1;
			}
			continue;
		}

		const value = inlineValue ?? argv[index + 1];
		if (value === undefined || value.startsWith("-")) {
			continue;
		}

		parsed[definition.name] = value;
		if (inlineValue === undefined) {
			index += 1;
		}
	}

	return parsed;
}

function parseBooleanArgument(value: string | undefined): boolean {
	if (value === undefined) {
		return true;
	}

	return !["0", "false", "no", "off"].includes(value.toLowerCase());
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
		if (value !== undefined && value !== "") {
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
