import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Context, Effect, Layer, ManagedRuntime } from "effect";

export interface RuntimeEnvironment {
	cwd: Effect.Effect<string>;
	chdir(path: string): Effect.Effect<void>;
	argv: Effect.Effect<readonly string[]>;
	getEnv(name: string): Effect.Effect<string | undefined>;
	setMaxListeners(count: number): Effect.Effect<void>;
	exit(code: number): Effect.Effect<never>;
}

export class RuntimeEnvironmentService extends Context.Service<
	RuntimeEnvironmentService,
	RuntimeEnvironment
>()("@markdown-confluence/RuntimeEnvironment") {}

export const RuntimeEnvironmentLive = Layer.succeed(RuntimeEnvironmentService, {
	cwd: Effect.sync(() => process.cwd()),
	chdir: (path) => Effect.sync(() => process.chdir(path)),
	argv: Effect.sync(() => process.argv),
	getEnv: (name) => Effect.sync(() => process.env[name]),
	setMaxListeners: (count) => Effect.sync(() => process.setMaxListeners(count)),
	exit: (code) =>
		Effect.sync(() => {
			process.exit(code);
		}) as Effect.Effect<never>,
});

export const MarkdownConfluencePlatformLive = Layer.mergeAll(
	NodeFileSystem.layer,
	NodePath.layer,
	RuntimeEnvironmentLive,
);

export type MarkdownConfluencePlatform = FileSystem | Path | RuntimeEnvironmentService;

export const MarkdownConfluenceRuntime = ManagedRuntime.make(MarkdownConfluencePlatformLive);

export function runEffect<A, E>(
	effect: Effect.Effect<A, E, MarkdownConfluencePlatform>,
): Promise<A> {
	return MarkdownConfluenceRuntime.runPromise(effect);
}

/** Piped input is separate from interactive terminal input. */
export class StandardInputService extends Context.Service<
	StandardInputService,
	{
		readAll: Effect.Effect<string, Error>;
	}
>()("@markdown-confluence/StandardInput") {}

export const StandardInputLive = Layer.succeed(StandardInputService, {
	readAll: Effect.tryPromise({
		try: async () => {
			if (process.stdin.isTTY)
				throw new Error("Input file is required when stdin is not piped.");
			process.stdin.setEncoding("utf-8");
			let input = "";
			for await (const chunk of process.stdin) input += chunk;
			return input;
		},
		catch: (error) => (error instanceof Error ? error : new Error(String(error))),
	}),
});
