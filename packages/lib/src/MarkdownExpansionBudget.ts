import { Context, Effect } from "effect";

export interface MarkdownExpansionLimits {
	maxEmbeds: number;
	maxPageBytes: number;
	maxWorkBytes: number;
}

/** Trusted runtime configuration; note content cannot change processing limits. */
export const MarkdownExpansionLimitsService = Context.Reference<Readonly<MarkdownExpansionLimits>>(
	"@markdown-confluence/MarkdownExpansionLimits",
	{
		defaultValue: () => ({
			maxEmbeds: 1_000,
			maxPageBytes: 10 * 1024 * 1024,
			maxWorkBytes: 32 * 1024 * 1024,
		}),
	},
);

export function validateMarkdownExpansionLimits(limits: Readonly<MarkdownExpansionLimits>) {
	return Effect.try({
		try: () => {
			for (const name of ["maxEmbeds", "maxPageBytes", "maxWorkBytes"] as const) {
				const limit = limits[name];
				if (!Number.isSafeInteger(limit) || limit <= 0)
					throw new Error(`Markdown expansion ${name} must be a positive safe integer`);
			}
		},
		catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
	});
}

export function makeMarkdownExpansionBudget(
	limits: Readonly<MarkdownExpansionLimits>,
	sourcePath: string,
) {
	let embedCount = 0;
	let workBytes = 0;
	const fail = (limit: string) =>
		Effect.fail(new Error(`Markdown expansion limit (${limit}) exceeded in ${sourcePath}`));
	const checkSize = (bytes: number | bigint) =>
		bytes > limits.maxPageBytes ? fail("page bytes") : Effect.void;
	const charge = (bytes: number) =>
		Effect.suspend(() => {
			if (bytes > limits.maxWorkBytes - workBytes) return fail("work bytes");
			workBytes += bytes;
			return Effect.void;
		});
	const visit = () =>
		Effect.suspend(() => {
			if (embedCount >= limits.maxEmbeds) return fail("embed count");
			embedCount++;
			return Effect.void;
		});
	const checkText = (text: string) => checkSize(Buffer.byteLength(text, "utf8"));
	return { checkSize, checkText, charge, visit };
}

export type MarkdownExpansionBudget = ReturnType<typeof makeMarkdownExpansionBudget>;
