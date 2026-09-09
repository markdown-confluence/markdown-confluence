import { Effect } from "effect";
import type { FileSystem } from "effect/FileSystem";
import type { Path } from "effect/Path";

export function isPathInside(path: Path, root: string, candidate: string): boolean {
	const relative = path.relative(root, candidate);
	return (
		relative === "" ||
		(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
	);
}

/** Owns both logical workspace identity and canonical filesystem authority. */
export function makeContentRootPaths(fs: FileSystem, path: Path, contentRoot: string) {
	return Effect.gen(function* () {
		const root = path.resolve(contentRoot);
		const canonicalRoot = yield* fs.realPath(root);
		const assertLogical = (candidate: string) =>
			Effect.try({
				try: () => {
					const absolute = path.resolve(candidate);
					if (!isPathInside(path, root, absolute))
						throw new Error(`Path is outside contentRoot: ${candidate}`);
					return absolute;
				},
				catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
			});
		const existing = (candidate: string) =>
			Effect.gen(function* () {
				const logical = yield* assertLogical(candidate);
				const canonical = yield* fs.realPath(logical);
				if (!isPathInside(path, canonicalRoot, canonical)) {
					return yield* Effect.fail(
						new Error(`Path resolves outside contentRoot: ${candidate}`),
					);
				}
				return canonical;
			});
		const input = (filePath: string) =>
			Effect.gen(function* () {
				if (path.isAbsolute(filePath)) return yield* assertLogical(filePath);
				const fromRoot = yield* assertLogical(path.resolve(root, filePath));
				const fromWorkingDirectory = path.resolve(filePath);
				if (isPathInside(path, root, fromWorkingDirectory)) {
					if ((yield* fs.exists(fromWorkingDirectory)) || !(yield* fs.exists(fromRoot)))
						return fromWorkingDirectory;
				}
				return fromRoot;
			});
		// Stored MarkdownFile paths are root-relative, never relative to process cwd.
		const reference = (filePath: string) => assertLogical(path.resolve(root, filePath));
		return { root, canonicalRoot, assertLogical, existing, input, reference };
	});
}
