import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { NodeServices } from "@effect/platform-node";
import { expect, test } from "@effect/vitest";
import { prepareIntegrationVault, vaultMarker } from "./integration-vault.js";

test("creates an isolated vault and refreshes artifacts without overwriting notes or credentials", async () => {
	await Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* () {
				const fs = yield* FileSystem;
				const path = yield* Path;
				const root = yield* fs.makeTempDirectoryScoped();
				const source = path.join(root, "repository");
				const vault = path.join(root, "vault");
				yield* fs.makeDirectory(path.join(source, "test-fixtures/release-vault"), {
					recursive: true,
				});
				yield* fs.makeDirectory(path.join(source, "packages/obsidian/dist"), {
					recursive: true,
				});
				yield* fs.writeFileString(
					path.join(source, "test-fixtures/release-vault/Fixture.md"),
					"---\nconnie-title: Example\n---\nOriginal",
				);
				for (const name of ["main.js", "manifest.json"])
					yield* fs.writeFileString(
						path.join(source, "packages/obsidian/dist", name),
						"version-one",
					);
				expect(
					(yield* prepareIntegrationVault(source, vault, {
						atlassianApiToken: "first-test-token",
					})).created,
				).toBe(true);
				expect(yield* fs.readFileString(path.join(vault, "Fixture.md"))).toMatch(
					/connie-title: Desktop \d+ Example/,
				);
				yield* fs.writeFileString(
					path.join(vault, "Fixture.md"),
					"Existing page ID and user edits",
				);
				yield* fs.writeFileString(
					path.join(source, "packages/obsidian/dist/main.js"),
					"version-two",
				);
				expect(
					(yield* prepareIntegrationVault(source, vault, {
						atlassianApiToken: "replacement-test-token",
					})).created,
				).toBe(false);
				expect(yield* fs.readFileString(path.join(vault, "Fixture.md"))).toBe(
					"Existing page ID and user edits",
				);
				expect(
					yield* fs.readFileString(
						path.join(vault, ".obsidian/plugins/confluence-integration/main.js"),
					),
				).toBe("version-two");
				expect(
					JSON.parse(
						yield* fs.readFileString(
							path.join(vault, ".obsidian/plugins/confluence-integration/data.json"),
						),
					).atlassianApiToken,
				).toBe("first-test-token");
			}),
		).pipe(Effect.provide(NodeServices.layer)),
	);
});

test("refuses existing unmarked or unrelated vaults before copying any plugin", async () => {
	await Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* () {
				const fs = yield* FileSystem;
				const path = yield* Path;
				const vault = yield* fs.makeTempDirectoryScoped();
				expect(
					(yield* Effect.result(prepareIntegrationVault("missing-repository", vault)))
						._tag,
				).toBe("Failure");
				yield* fs.writeFileString(
					path.join(vault, vaultMarker),
					'{"kind":"unrelated","version":1}',
				);
				expect(
					(yield* Effect.result(prepareIntegrationVault("missing-repository", vault)))
						._tag,
				).toBe("Failure");
				expect(yield* fs.exists(path.join(vault, ".obsidian"))).toBe(false);
			}),
		).pipe(Effect.provide(NodeServices.layer)),
	);
});
