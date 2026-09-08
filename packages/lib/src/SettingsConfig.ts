import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { Config, ConfigProvider, Effect, Layer, Schema } from "effect";
import {
	MarkdownConfluencePlatform,
	runEffect,
	RuntimeEnvironment,
	RuntimeEnvironmentService,
} from "./effects";
import {
	ConfluenceAuthType,
	ConfluenceSettings,
	ConfluenceSettingsService,
	DEFAULT_SETTINGS,
	validateConfluenceSettings,
} from "./Settings";

const CONFLUENCE_SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof ConfluenceSettings)[];

type ArgumentDefinition = {
	name: string;
	aliases?: string[];
	type: "boolean" | "string";
};

type ArgumentValue = boolean | string | undefined;

const confluenceConnectionFields = {
	confluenceBaseUrl: Config.string("confluenceBaseUrl"),
	confluenceSiteUrl: Config.string("confluenceSiteUrl").pipe(
		Config.withDefault(DEFAULT_SETTINGS.confluenceSiteUrl),
	),
	mermaidProtocolTimeout: Config.number("mermaidProtocolTimeout").pipe(
		Config.withDefault(DEFAULT_SETTINGS.mermaidProtocolTimeout),
	),
	atlassianUserName: Config.string("atlassianUserName").pipe(Config.withDefault("")),
	atlassianApiToken: Config.string("atlassianApiToken").pipe(Config.withDefault("")),
	atlassianClientId: Config.string("atlassianClientId").pipe(Config.withDefault("")),
	atlassianClientSecret: Config.string("atlassianClientSecret").pipe(Config.withDefault("")),
	confluenceAuthType: Config.string("confluenceAuthType").pipe(
		Config.withDefault(DEFAULT_SETTINGS.confluenceAuthType),
		Config.map((value) => value as ConfluenceAuthType),
	),
	confluenceApiPrefix: Config.string("confluenceApiPrefix").pipe(
		Config.withDefault(DEFAULT_SETTINGS.confluenceApiPrefix),
	),
	confluenceRequestHeaders: Config.schema(
		Config.Record(Schema.String, Schema.String),
		"confluenceRequestHeaders",
	).pipe(Config.withDefault(DEFAULT_SETTINGS.confluenceRequestHeaders)),
};

export const confluenceReadSettingsConfig = Config.all(confluenceConnectionFields).pipe(
	Config.map((connection) => ({ ...DEFAULT_SETTINGS, ...connection })),
);

export const confluenceSettingsConfig = Config.all({
	...confluenceConnectionFields,
	confluenceParentId: Config.string("confluenceParentId"),
	folderToPublish: Config.string("folderToPublish"),
	tagsToPublish: Config.string("tagsToPublish").pipe(
		Config.withDefault(DEFAULT_SETTINGS.tagsToPublish),
	),
	contentRoot: Config.string("contentRoot"),
	firstHeadingPageTitle: Config.boolean("firstHeadingPageTitle"),
	lockPublishedPages: Config.boolean("lockPublishedPages").pipe(Config.withDefault(false)),
	forceOverwrite: Config.boolean("forceOverwrite").pipe(
		Config.withDefault(DEFAULT_SETTINGS.forceOverwrite),
	),
	pageHeaderMarkdown: Config.string("pageHeaderMarkdown").pipe(Config.withDefault("")),
	pageFooterMarkdown: Config.string("pageFooterMarkdown").pipe(Config.withDefault("")),
	ignoredCodeBlockLanguages: Config.schema(
		Schema.Array(Schema.String),
		"ignoredCodeBlockLanguages",
	).pipe(Config.withDefault([])),
	plantuml: Config.all({
		enabled: Config.boolean("enabled").pipe(
			Config.withDefault(DEFAULT_SETTINGS.plantuml.enabled),
		),
		serverUrl: Config.string("serverUrl").pipe(
			Config.withDefault(DEFAULT_SETTINGS.plantuml.serverUrl),
		),
	}).pipe(Config.nested("plantuml")),
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
		const validationResult = validateConfluenceSettings(settings);

		if (!validationResult.valid) {
			return yield* Effect.fail(
				new Error(validationResult.issues.map((issue) => issue.message).join("\n")),
			);
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
		const lockPublishedPages = yield* runtimeEnvironment.getEnv(
			"CONFLUENCE_LOCK_PUBLISHED_PAGES",
		);
		const forceOverwrite = yield* runtimeEnvironment.getEnv("CONFLUENCE_FORCE_OVERWRITE");
		const plantumlEnabled = yield* runtimeEnvironment.getEnv("CONFLUENCE_PLANTUML_ENABLED");
		const plantumlServerUrl = yield* runtimeEnvironment.getEnv(
			"CONFLUENCE_PLANTUML_SERVER_URL",
		);

		return ConfigProvider.fromEnv({
			env: compactRecord({
				confluenceBaseUrl: yield* runtimeEnvironment.getEnv("CONFLUENCE_BASE_URL"),
				confluenceSiteUrl: yield* runtimeEnvironment.getEnv("CONFLUENCE_SITE_URL"),
				confluenceParentId: yield* runtimeEnvironment.getEnv("CONFLUENCE_PARENT_ID"),
				mermaidProtocolTimeout: yield* runtimeEnvironment.getEnv(
					"CONFLUENCE_MERMAID_PROTOCOL_TIMEOUT",
				),
				atlassianUserName: yield* runtimeEnvironment.getEnv("ATLASSIAN_USERNAME"),
				atlassianApiToken: yield* runtimeEnvironment.getEnv("ATLASSIAN_API_TOKEN"),
				confluenceAuthType: yield* runtimeEnvironment.getEnv("CONFLUENCE_AUTH_TYPE"),
				confluenceApiPrefix: yield* runtimeEnvironment.getEnv("CONFLUENCE_API_PREFIX"),
				confluenceRequestHeaders: yield* runtimeEnvironment.getEnv(
					"CONFLUENCE_REQUEST_HEADERS",
				),
				atlassianClientId: yield* runtimeEnvironment.getEnv("ATLASSIAN_CLIENT_ID"),
				atlassianClientSecret: yield* runtimeEnvironment.getEnv("ATLASSIAN_CLIENT_SECRET"),
				folderToPublish: yield* runtimeEnvironment.getEnv("FOLDER_TO_PUBLISH"),
				tagsToPublish: yield* runtimeEnvironment.getEnv("CONFLUENCE_TAGS_TO_PUBLISH"),
				contentRoot: yield* runtimeEnvironment.getEnv("CONFLUENCE_CONTENT_ROOT"),
				firstHeadingPageTitle: firstHeadingPageTitle,
				forceOverwrite,
				lockPublishedPages,
				pageHeaderMarkdown: yield* runtimeEnvironment.getEnv(
					"CONFLUENCE_PAGE_HEADER_MARKDOWN",
				),
				pageFooterMarkdown: yield* runtimeEnvironment.getEnv(
					"CONFLUENCE_PAGE_FOOTER_MARKDOWN",
				),
				// fromEnv splits nested config paths on "_", so plantuml.enabled
				// and plantuml.serverUrl are supplied as plantuml_enabled /
				// plantuml_serverUrl here.
				plantuml_enabled: plantumlEnabled,
				plantuml_serverUrl: plantumlServerUrl,
			}),
		});
	});
}

function makeCommandLineProvider(argv: readonly string[]): ConfigProvider.ConfigProvider {
	const options = parseArgumentValues(argv, [
		{ name: "baseUrl", aliases: ["b"], type: "string" },
		{ name: "siteUrl", type: "string" },
		{ name: "parentId", aliases: ["p"], type: "string" },
		{ name: "mermaidProtocolTimeout", type: "string" },
		{ name: "userName", aliases: ["u"], type: "string" },
		{ name: "apiToken", type: "string" },
		{ name: "authType", type: "string" },
		{ name: "apiPrefix", type: "string" },
		{ name: "requestHeaders", type: "string" },
		{ name: "clientId", type: "string" },
		{ name: "clientSecret", type: "string" },
		{ name: "enableFolder", aliases: ["f"], type: "string" },
		{ name: "tagsToPublish", aliases: ["t"], type: "string" },
		{ name: "contentRoot", aliases: ["cr"], type: "string" },
		{ name: "firstHeaderPageTitle", aliases: ["fh"], type: "boolean" },
		{ name: "lockPublishedPages", type: "boolean" },
		{ name: "forceOverwrite", aliases: ["fo"], type: "boolean" },
		{ name: "pageHeaderMarkdown", type: "string" },
		{ name: "pageFooterMarkdown", type: "string" },
		{ name: "plantumlEnabled", type: "boolean" },
		{ name: "plantumlServerUrl", type: "string" },
	]);

	const plantuml = compactRecord({
		enabled: options["plantumlEnabled"],
		serverUrl: options["plantumlServerUrl"],
	});

	return ConfigProvider.fromUnknown({
		...compactRecord({
			confluenceBaseUrl: options["baseUrl"],
			confluenceSiteUrl: options["siteUrl"],
			confluenceParentId: options["parentId"],
			mermaidProtocolTimeout: options["mermaidProtocolTimeout"],
			atlassianUserName: options["userName"],
			atlassianApiToken: options["apiToken"],
			confluenceAuthType: options["authType"],
			confluenceApiPrefix: options["apiPrefix"],
			confluenceRequestHeaders: options["requestHeaders"],
			atlassianClientId: options["clientId"],
			atlassianClientSecret: options["clientSecret"],
			folderToPublish: options["enableFolder"],
			tagsToPublish: options["tagsToPublish"],
			contentRoot: options["contentRoot"],
			firstHeadingPageTitle: options["firstHeaderPageTitle"],
			forceOverwrite: options["forceOverwrite"],
			lockPublishedPages: options["lockPublishedPages"],
			pageHeaderMarkdown: options["pageHeaderMarkdown"],
			pageFooterMarkdown: options["pageFooterMarkdown"],
		}),
		...(Object.keys(plantuml).length > 0 ? { plantuml } : {}),
	});
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

		// `plantuml` is a nested object; copy its known sub-keys through with
		// the right types so a partial config file still merges cleanly.
		if (key === "plantuml") {
			const value = config[key];
			if (value && typeof value === "object" && !Array.isArray(value)) {
				const plantuml = value as Record<string, unknown>;
				const picked: Partial<ConfluenceSettings["plantuml"]> = {};
				if (typeof plantuml["enabled"] === "boolean") {
					picked.enabled = plantuml["enabled"];
				}
				if (typeof plantuml["serverUrl"] === "string") {
					picked.serverUrl = plantuml["serverUrl"];
				}
				if (Object.keys(picked).length > 0) {
					result.plantuml = picked as ConfluenceSettings["plantuml"];
				}
			}
			continue;
		}

		const value = config[key];
		if (isConfluenceSettingValue(key, value)) {
			(result as Record<string, unknown>)[key] = value;
		}
	}

	return result;
}

function isConfluenceSettingValue(key: keyof ConfluenceSettings, value: unknown): boolean {
	if (key === "confluenceRequestHeaders") {
		return isStringRecord(value);
	}

	if (Array.isArray(DEFAULT_SETTINGS[key])) {
		return Array.isArray(value) && value.every((item) => typeof item === "string");
	}
	return typeof value === typeof DEFAULT_SETTINGS[key];
}

function isStringRecord(value: unknown): value is Record<string, string> {
	return (
		value !== null &&
		!Array.isArray(value) &&
		typeof value === "object" &&
		Object.values(value).every((entry) => typeof entry === "string")
	);
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
