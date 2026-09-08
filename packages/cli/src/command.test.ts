import { expect, test, vi } from "@effect/vitest";
import { Console, Effect } from "effect";
import { RuntimeEnvironmentService, type RuntimeEnvironment } from "@markdown-confluence/lib";
import { dispatchCommand, parseCliCommand } from "./command";

function commandHarness(args: string[]) {
	const createClient = vi.fn(() => ({}));
	const publishEffect = vi.fn(() => Effect.void);
	const createPublisher = vi.fn(() => ({ publishEffect }));
	const handlers = {
		publish: vi.fn((_report?: string) => {
			createClient();
			return createPublisher().publishEffect();
		}),
		preflight: vi.fn(() => Effect.void),
		convert: vi.fn(() => Effect.void),
	};
	const getEnv = vi.fn(() => Effect.die("Unexpected settings access"));
	const runtime: RuntimeEnvironment = {
		argv: Effect.succeed(["node", "markdown-confluence", ...args]),
		cwd: Effect.die("Unexpected workspace access"),
		chdir: () => Effect.die("Unexpected workspace access"),
		getEnv,
		setMaxListeners: () => Effect.die("Unexpected runtime mutation"),
		exit: () => Effect.die("Unexpected exit"),
	};
	const log = vi.fn();
	const effect = dispatchCommand(handlers).pipe(
		Effect.provideService(RuntimeEnvironmentService, runtime),
		Effect.provideService(Console.Console, { ...console, log }),
	);
	return { effect, handlers, createClient, createPublisher, publishEffect, getEnv, log };
}

test.each([
	{ args: ["valdiate"], error: "Unknown command: valdiate" },
	{ args: ["plna"], error: "Unknown command: plna" },
	{ args: ["--dry-run"], error: "Unknown option: --dry-run" },
	{ args: ["--forceOverwrite=fales"], error: "--forceOverwrite requires a boolean value" },
	{ args: ["--forceOverwrite", "fales"], error: "--forceOverwrite requires a boolean value" },
	{ args: ["--forceOverwrite="], error: "--forceOverwrite requires a boolean value" },
	{ args: ["--parentId"], error: "--parentId requires a value" },
	{ args: ["--config"], error: "--config requires a value" },
	{ args: ["--report"], error: "--report requires a value" },
	{ args: ["--report", "--forceOverwrite"], error: "--report requires a value" },
	{ args: ["--parentId="], error: "--parentId requires a value" },
	{ args: ["--parentId", "-123"], error: "--parentId requires a value" },
	{ args: ["--apiToken", "test-token", "plna"], error: "Unexpected argument: plna" },
	{ args: ["--forceOverwrite", "false", "valdiate"], error: "Unexpected argument: valdiate" },
	{ args: ["--", "valdiate"], error: "Unexpected argument: valdiate" },
	{ args: ["validate", "--dry-run"], error: "Unknown option: --dry-run" },
	{ args: ["plan", "--input"], error: "--input requires a value" },
	{ args: ["plan", "--report", "-"], error: "Unknown option: --report" },
	{ args: ["to-adf", "--forceOverwrite"], error: "Unknown to-adf option" },
	{ args: ["to-markdown", "--input"], error: "--input requires a value" },
])("rejects $args before calling any command or service", async ({ args, error }) => {
	const harness = commandHarness(args);
	await expect(Effect.runPromise(harness.effect)).rejects.toThrow(error);
	expect(harness.handlers.publish).not.toHaveBeenCalled();
	expect(harness.handlers.preflight).not.toHaveBeenCalled();
	expect(harness.handlers.convert).not.toHaveBeenCalled();
	expect(harness.createClient).not.toHaveBeenCalled();
	expect(harness.createPublisher).not.toHaveBeenCalled();
	expect(harness.publishEffect).not.toHaveBeenCalled();
	expect(harness.getEnv).not.toHaveBeenCalled();
	expect(harness.log).not.toHaveBeenCalled();
});

test.each([
	["-h"],
	["--help"],
	["--forceOverwrite", "--help"],
	["--parentId", "123", "-h"],
	...["validate", "plan", "to-adf", "to-markdown", "from-adf"].flatMap((command) => [
		[command, "-h"],
		[command, "--help"],
	]),
])("help %j avoids settings, clients, publishers and command work", async (...args) => {
	const harness = commandHarness(args);
	await Effect.runPromise(harness.effect);
	expect(harness.log).toHaveBeenCalledOnce();
	expect(harness.handlers.publish).not.toHaveBeenCalled();
	expect(harness.handlers.preflight).not.toHaveBeenCalled();
	expect(harness.handlers.convert).not.toHaveBeenCalled();
	expect(harness.createClient).not.toHaveBeenCalled();
	expect(harness.createPublisher).not.toHaveBeenCalled();
	expect(harness.publishEffect).not.toHaveBeenCalled();
	expect(harness.getEnv).not.toHaveBeenCalled();
});

test("keeps intentional no-command publishing and passes report destinations", async () => {
	for (const args of [[], ["--report", "-"], ["--report=publish.json"]]) {
		const harness = commandHarness(args);
		await Effect.runPromise(harness.effect);
		expect(harness.createClient).toHaveBeenCalledOnce();
		expect(harness.createPublisher).toHaveBeenCalledOnce();
		expect(harness.publishEffect).toHaveBeenCalledOnce();
		expect(harness.handlers.publish).toHaveBeenCalledExactlyOnceWith(
			args.length === 0 ? undefined : args.length === 2 ? "-" : "publish.json",
		);
	}
});

test("option values that look like command names remain values", () => {
	expect(
		parseCliCommand([
			"--config",
			"validate",
			"--pageHeaderMarkdown",
			"plan",
			"--apiToken=to-adf",
			"--fo=false",
			"-p",
			"123",
			"--report",
			"to-markdown",
		]),
	).toEqual({ kind: "publish", report: "to-markdown" });
});

test("dispatches validated preflight options and conversion aliases", async () => {
	const preflight = commandHarness([
		"validate",
		"--input=page.md",
		"--output",
		"-",
		"-c",
		"config.json",
		"--fo=false",
	]);
	await Effect.runPromise(preflight.effect);
	expect(preflight.handlers.preflight).toHaveBeenCalledExactlyOnceWith("validate", {
		input: "page.md",
		output: "-",
	});
	expect(preflight.createClient).not.toHaveBeenCalled();
	const conversion = commandHarness(["from-adf", "--readable", "--", "-h"]);
	await Effect.runPromise(conversion.effect);
	expect(conversion.handlers.convert).toHaveBeenCalledExactlyOnceWith("to-markdown", [
		"--readable",
		"--",
		"-h",
	]);
	expect(conversion.createClient).not.toHaveBeenCalled();
});
