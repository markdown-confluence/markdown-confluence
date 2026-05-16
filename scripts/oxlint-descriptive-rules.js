import path from "node:path";

const blockedTerms = new Set([
	"util",
	"utils",
	"helper",
	"helpers",
	"common",
	"shared",
	"misc",
	"miscellaneous",
	"generic",
]);

function stripKnownExtensions(fileName) {
	return fileName.replace(/(\.d)?\.[^.]+$/u, "");
}

function splitNameIntoTerms(name) {
	return name
		.replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
		.split(/[^A-Za-z0-9]+/u)
		.filter(Boolean)
		.map((term) => term.toLowerCase());
}

function findBlockedTerm(name) {
	return splitNameIntoTerms(String(name)).find((term) => blockedTerms.has(term));
}

function reportName(context, node, name, kind) {
	const blockedTerm = findBlockedTerm(name);
	if (!blockedTerm) {
		return;
	}

	context.report({
		data: {
			kind,
			name,
			term: blockedTerm,
		},
		messageId: "vagueName",
		node,
	});
}

function checkBindingName(context, node, kind) {
	if (!node) {
		return;
	}

	if (node.type === "Identifier") {
		reportName(context, node, node.name, kind);
		return;
	}

	if (node.type === "ObjectPattern") {
		for (const property of node.properties) {
			if (property.type === "Property") {
				checkBindingName(context, property.value, kind);
			} else if (property.type === "RestElement") {
				checkBindingName(context, property.argument, kind);
			}
		}
		return;
	}

	if (node.type === "ArrayPattern") {
		for (const element of node.elements) {
			checkBindingName(context, element, kind);
		}
		return;
	}

	if (node.type === "RestElement") {
		checkBindingName(context, node.argument, kind);
	}
}

function checkDeclarationId(context, node, kind) {
	if (node?.id?.type === "Identifier") {
		reportName(context, node.id, node.id.name, kind);
	}
}

function checkNamedKey(context, node, kind) {
	const key = node?.key;
	if (!key) {
		return;
	}

	if (key.type === "Identifier") {
		reportName(context, key, key.name, kind);
		return;
	}

	if (key.type === "Literal" && typeof key.value === "string") {
		reportName(context, key, key.value, kind);
	}
}

function isImplementationStatement(statement) {
	if (statement.type === "ImportDeclaration") {
		return false;
	}

	if (statement.type === "ExportAllDeclaration") {
		return false;
	}

	if (statement.type === "ExportNamedDeclaration") {
		return !statement.source;
	}

	return true;
}

const noVagueNames = {
	meta: {
		docs: {
			description: "Prevent generic terms in declarations and object names.",
		},
		messages: {
			vagueName:
				'{{kind}} "{{name}}" uses the generic term "{{term}}". Use a descriptive domain name instead.',
		},
		type: "suggestion",
	},
	create(context) {
		return {
			VariableDeclarator(node) {
				checkBindingName(context, node.id, "Variable");
			},
			FunctionDeclaration(node) {
				checkDeclarationId(context, node, "Function");
			},
			ClassDeclaration(node) {
				checkDeclarationId(context, node, "Class");
			},
			TSTypeAliasDeclaration(node) {
				reportName(context, node.id, node.id.name, "Type alias");
			},
			TSInterfaceDeclaration(node) {
				reportName(context, node.id, node.id.name, "Interface");
			},
			TSEnumDeclaration(node) {
				reportName(context, node.id, node.id.name, "Enum");
			},
			TSEnumMember(node) {
				checkNamedKey(context, node, "Enum member");
			},
			Property(node) {
				if (!node.computed) {
					checkNamedKey(context, node, "Object property");
				}
			},
			PropertyDefinition(node) {
				if (!node.computed) {
					checkNamedKey(context, node, "Member");
				}
			},
			MethodDefinition(node) {
				if (!node.computed) {
					checkNamedKey(context, node, "Member");
				}
			},
			TSPropertySignature(node) {
				if (!node.computed) {
					checkNamedKey(context, node, "Member");
				}
			},
			TSMethodSignature(node) {
				if (!node.computed) {
					checkNamedKey(context, node, "Member");
				}
			},
			ImportDefaultSpecifier(node) {
				reportName(context, node.local, node.local.name, "Import");
			},
			ImportNamespaceSpecifier(node) {
				reportName(context, node.local, node.local.name, "Import");
			},
			ImportSpecifier(node) {
				reportName(context, node.local, node.local.name, "Import");
			},
			"FunctionDeclaration > Identifier.params, FunctionExpression > Identifier.params, ArrowFunctionExpression > Identifier.params"(
				node,
			) {
				reportName(context, node, node.name, "Parameter");
			},
		};
	},
};

const noReExports = {
	meta: {
		docs: {
			description: "Prevent module re-exports and pure barrel files.",
		},
		messages: {
			barrelFile: "Barrel files that only aggregate exports are not allowed.",
			reExport: 'Re-export from "{{modulePath}}" is not allowed.',
		},
		type: "suggestion",
	},
	create(context) {
		return {
			ExportAllDeclaration(node) {
				context.report({
					data: {
						modulePath: node.source?.value ?? "another module",
					},
					messageId: "reExport",
					node,
				});
			},
			ExportNamedDeclaration(node) {
				if (!node.source) {
					return;
				}

				context.report({
					data: {
						modulePath: node.source.value ?? "another module",
					},
					messageId: "reExport",
					node,
				});
			},
			"Program:exit"(node) {
				const fileName = stripKnownExtensions(
					path.basename(context.filename),
				).toLowerCase();
				if (fileName !== "index") {
					return;
				}

				const hasModuleReExport = node.body.some(
					(statement) =>
						(statement.type === "ExportNamedDeclaration" && statement.source) ||
						statement.type === "ExportAllDeclaration",
				);
				const hasImplementation = node.body.some(isImplementationStatement);

				if (hasModuleReExport && !hasImplementation) {
					context.report({
						loc: { column: 0, line: 1 },
						messageId: "barrelFile",
					});
				}
			},
		};
	},
};

export default {
	meta: {
		name: "descriptive",
	},
	rules: {
		"no-vague-names": noVagueNames,
		"no-re-exports": noReExports,
	},
};
