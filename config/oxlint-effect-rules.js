import { Plugin, Rule } from "@effect-oxlint/effect-oxlint";

const nodePlatformModules = new Set([
	"fs",
	"fs/promises",
	"node:fs",
	"node:fs/promises",
	"node:os",
	"node:path",
	"node:process",
	"os",
	"path",
	"process",
]);

const bannedVitestModules = new Set(["vitest", "vite-plus/test"]);
const defaultAllowedProcessFileEndings = ["/packages/lib/src/effects/index.ts"];

function getFilename(context) {
	if (typeof context.getFilename === "function") {
		return context.getFilename();
	}

	return context.filename ?? context.physicalFilename ?? "";
}

function getRuleOption(context) {
	return context.options?.[0] ?? {};
}

function normalizeFilename(filename) {
	return filename.replaceAll("\\", "/");
}

function isAllowedProcessFile(context) {
	const options = getRuleOption(context);
	const allowedProcessFileEndings =
		options.allowedProcessFileEndings ?? defaultAllowedProcessFileEndings;
	const filename = normalizeFilename(getFilename(context));

	return allowedProcessFileEndings.some((ending) => filename.endsWith(ending));
}

function isBannedVitestModule(source) {
	return bannedVitestModules.has(source) || source.startsWith("vitest/");
}

function getStaticPropertyName(node) {
	if (!node) {
		return undefined;
	}

	if (node.type === "Identifier") {
		return node.name;
	}

	if (node.type === "Literal" && typeof node.value === "string") {
		return node.value;
	}

	return undefined;
}

function isEffectAllCall(node) {
	if (!node || node.type !== "CallExpression") {
		return false;
	}

	const callee = node.callee;
	return (
		callee?.type === "MemberExpression" &&
		callee.object?.type === "Identifier" &&
		callee.object.name === "Effect" &&
		getStaticPropertyName(callee.property) === "all"
	);
}

function hasExplicitConcurrencyOption(node) {
	const options = node.arguments?.[1];
	if (!options || options.type !== "ObjectExpression") {
		return false;
	}

	return options.properties.some((property) => {
		if (property.type !== "Property") {
			return false;
		}

		return getStaticPropertyName(property.key) === "concurrency";
	});
}

const requireEffectAllConcurrency = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require Effect.all calls to specify concurrency explicitly, so migrations from Promise.all do not accidentally become sequential.",
		},
		schema: [],
	},
	create(context) {
		return {
			CallExpression(node) {
				if (!isEffectAllCall(node) || hasExplicitConcurrencyOption(node)) {
					return;
				}

				context.report({
					node,
					message:
						'Effect.all must specify an explicit concurrency option. Use { concurrency: "unbounded" } to preserve Promise.all behavior or a bounded value when intentional.',
				});
			},
		};
	},
};

const noDirectNodePlatform = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require source to use Effect platform services instead of direct Node fs/path/os/process APIs.",
		},
		schema: [
			{
				type: "object",
				properties: {
					allowedProcessFileEndings: {
						type: "array",
						items: { type: "string" },
					},
				},
				additionalProperties: false,
			},
		],
	},
	create(context) {
		return {
			ImportDeclaration(node) {
				const source = node.source?.value;
				if (typeof source === "string" && nodePlatformModules.has(source)) {
					context.report({
						node,
						message:
							"Use Effect platform services instead of direct Node fs/path/os/process imports.",
					});
				}
			},
			MemberExpression(node) {
				if (isAllowedProcessFile(context)) {
					return;
				}

				if (node.object?.type === "Identifier" && node.object.name === "process") {
					context.report({
						node,
						message: "Use RuntimeEnvironmentService instead of direct process access.",
					});
				}
			},
		};
	},
};

const noVitestImports = Rule.banImport(isBannedVitestModule, {
	message: "Use @effect/vitest instead of direct vitest or vite-plus/test imports.",
	meta: {
		type: "problem",
	},
});

export default Plugin.define({
	name: "effect",
	rules: {
		"require-effect-all-concurrency": requireEffectAllConcurrency,
		"no-direct-node-platform": noDirectNodePlatform,
		"no-vitest-imports": noVitestImports,
	},
});
