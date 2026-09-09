import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite-plus";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { NodeFileSystem } from "@effect/platform-node";
import { PuppeteerMermaidRenderer } from "../packages/mermaid-puppeteer-renderer/dist/index.js";
import { mermaidRuntimeBundlePlugin } from "../packages/mermaid-electron-renderer/rendererBundlePlugin.ts";
import { verifyMermaidResourcePolicy } from "./mermaid-security-checks.js";

const requireElectron = createRequire(
	new URL("../packages/mermaid-electron-renderer/package.json", import.meta.url),
);
const electronBinary = requireElectron("electron");
await Effect.runPromise(
	Effect.gen(function* () {
		const fs = yield* FileSystem;
		const directory = yield* fs.makeTempDirectory({
			prefix: "markdown-confluence-mermaid-security-",
		});
		const marker = `${directory}/outside-root-marker.png`;
		yield* fs.writeFile(
			marker,
			Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jkAAAAABJRU5ErkJggg==",
				"base64",
			),
		);
		const chromium = yield* Effect.tryPromise(() =>
			verifyMermaidResourcePolicy(
				(options) => new PuppeteerMermaidRenderer({ protocolTimeout: 30_000 }, options),
				pathToFileURL(marker).href,
			),
		);
		console.log(JSON.stringify({ runtime: "Chromium (locked Puppeteer)", ...chromium }));
		yield* fs.writeFileString(`${directory}/chromium.json`, JSON.stringify(chromium, null, 2));
		console.log(`Mermaid security evidence: ${directory}`);
		yield* Effect.tryPromise(() =>
			build({
				configFile: false,
				plugins: [mermaidRuntimeBundlePlugin()],
				resolve: {
					alias: { "@electron/remote": requireElectron.resolve("@electron/remote") },
				},
				build: {
					outDir: directory,
					emptyOutDir: false,
					lib: {
						entry: fileURLToPath(
							new URL("./mermaid-security-remote-host.js", import.meta.url),
						),
						formats: ["cjs"],
						fileName: () => "remote-host.cjs",
					},
					rollupOptions: {
						external: [/^node:/u, requireElectron.resolve("@electron/remote")],
						output: { codeSplitting: false },
					},
					target: "node24",
				},
			}),
		);
		yield* Effect.tryPromise(() =>
			build({
				configFile: false,
				define: {
					MERMAID_REMOTE_MAIN: JSON.stringify(
						requireElectron.resolve("@electron/remote/main"),
					),
				},
				build: {
					outDir: directory,
					emptyOutDir: false,
					lib: {
						entry: fileURLToPath(
							new URL("./mermaid-security-electron.js", import.meta.url),
						),
						formats: ["es"],
						fileName: () => "electron.mjs",
					},
					rollupOptions: {
						external: [/^node:/u, "electron"],
						output: { codeSplitting: false },
					},
					target: "node24",
				},
			}),
		);
		const electron = yield* Effect.tryPromise(
			() =>
				new Promise((resolve, reject) => {
					let output = "";
					const child = spawn(
						electronBinary,
						[`${directory}/electron.mjs`, "--user-data-dir=" + directory + "/profile"],
						{ stdio: ["ignore", "pipe", "inherit"] },
					);
					child.stdout.on("data", (chunk) => {
						output += chunk.toString();
						console.log(chunk.toString().trimEnd());
					});
					const timeout = setTimeout(() => child.kill("SIGKILL"), 120_000);
					child.once("error", reject);
					child.once("close", (code) => {
						clearTimeout(timeout);
						if (code !== 0)
							return reject(new Error(`Electron security checks exited ${code}`));
						try {
							const record = output
								.split("\n")
								.find((line) => line.startsWith('{"runtime":"Electron'));
							if (!record)
								throw new Error("Electron produced no verification evidence");
							resolve(JSON.parse(record));
						} catch (error) {
							reject(error);
						}
					});
				}),
		);
		yield* fs.writeFileString(`${directory}/electron.json`, JSON.stringify(electron, null, 2));
	}).pipe(Effect.provide(NodeFileSystem.layer)),
);
