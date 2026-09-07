import { Console, Effect } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import {
	RuntimeEnvironmentLive,
	RuntimeEnvironmentService,
} from "../../packages/lib/src/effects/index.ts";
import { createOAuthBroker } from "./server.js";

const program = Effect.scoped(
	Effect.gen(function* () {
		const environment = yield* RuntimeEnvironmentService;
		const publicUrl =
			(yield* environment.getEnv("OAUTH_PUBLIC_URL")) || "http://127.0.0.1:8766";
		const port = Number((yield* environment.getEnv("PORT")) || 8766);
		const bind = (yield* environment.getEnv("OAUTH_BIND")) || "127.0.0.1";
		const clientId = yield* environment.getEnv("OAUTH_CLIENT_ID");
		const clientSecret = yield* environment.getEnv("OAUTH_CLIENT_SECRET");
		yield* Effect.acquireRelease(
			Effect.tryPromise(
				() =>
					new Promise((resolve, reject) => {
						const server = createOAuthBroker({ clientId, clientSecret, publicUrl });
						server.requestTimeout = 20000;
						server.headersTimeout = 10000;
						server.once("error", reject);
						server.listen(port, bind, () => resolve(server));
					}),
			),
			(server) => Effect.promise(() => new Promise((resolve) => server.close(resolve))),
		);
		yield* Console.log(`OAuth service listening on port ${port}`);
		yield* Effect.never;
	}),
);
NodeRuntime.runMain(program.pipe(Effect.provide(RuntimeEnvironmentLive)));
