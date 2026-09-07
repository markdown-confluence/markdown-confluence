import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { Effect } from "effect";

export const vaultMarker = ".confluence-integration-vault.json";

/** Only refresh plugin artifacts in a vault created by this harness. */
export function prepareIntegrationVault(repositoryRoot, vaultPath, settings = {}) {
	return Effect.gen(function* () {
		const fs = yield* FileSystem;
		const path = yield* Path;
		const markerPath = path.join(vaultPath, vaultMarker);
		const exists = yield* fs.exists(vaultPath);
		if (exists && !(yield* fs.exists(markerPath))) {
			return yield* Effect.fail(
				new Error(
					"Refusing to overwrite an existing unmarked vault. Choose a new --vault path.",
				),
			);
		}
		if (exists) {
			const marker = JSON.parse(yield* fs.readFileString(markerPath));
			if (marker.kind !== "markdown-confluence-integration" || marker.version !== 1)
				return yield* Effect.fail(new Error("Unrecognized integration vault marker"));
		} else {
			yield* fs.copy(path.join(repositoryRoot, "test-fixtures/release-vault"), vaultPath);
			const prefix = `Desktop ${Date.now()} `;
			for (const filename of yield* fs.readDirectory(vaultPath, { recursive: true })) {
				if (!filename.endsWith(".md")) continue;
				const target = path.join(vaultPath, filename);
				const markdown = yield* fs.readFileString(target);
				yield* fs.writeFileString(
					target,
					markdown.replace(
						/^connie-title: (.+)$/m,
						(_match, title) => `connie-title: ${prefix}${title}`,
					),
				);
			}
			yield* fs.writeFileString(
				markerPath,
				JSON.stringify(
					{ kind: "markdown-confluence-integration", version: 1, prefix },
					null,
					2,
				),
			);
		}
		const pluginPath = path.join(vaultPath, ".obsidian/plugins/confluence-integration");
		yield* fs.makeDirectory(pluginPath, { recursive: true });
		for (const filename of ["main.js", "manifest.json"]) {
			yield* fs.copyFile(
				path.join(repositoryRoot, "packages/obsidian/dist", filename),
				path.join(pluginPath, filename),
			);
		}
		const settingsPath = path.join(pluginPath, "data.json");
		if (!(yield* fs.exists(settingsPath))) {
			yield* fs.writeFileString(
				settingsPath,
				JSON.stringify(
					{
						...settings,
						contentRoot: vaultPath,
						folderToPublish: "Release Tests",
						tagsToPublish: "release-test",
						ignoredCodeBlockLanguages: ["dataview", "button"],
						plantuml: { enabled: true, serverUrl: "https://www.plantuml.com/plantuml" },
						showPublishResultsModal: true,
					},
					null,
					2,
				),
				{ mode: 0o600 },
			);
		}
		return { vaultPath, created: !exists, pluginPath };
	});
}
