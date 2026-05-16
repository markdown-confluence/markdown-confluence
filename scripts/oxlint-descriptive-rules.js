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

/**
 * Remove the final file extension from a filename, also stripping an optional `.d` prefix before that extension.
 * @param {string} fileName - The filename to normalize (may include extensions like `.js` or `.d.ts`).
 * @returns {string} The filename with the trailing extension removed (e.g., `foo.d.ts` -> `foo`, `bar.js` -> `bar`).
 */
function stripKnownExtensions(fileName) {
	return fileName.replace(/(\.d)?\.[^.]+$/u, "");
}

function getFileName(filePath) {
	return filePath.split(/[\\/]/u).at(-1) ?? filePath;
}

/**
 * Split an identifier or filename into normalized lowercase terms.
 *
 * Breaks camelCase/PascalCase and acronym boundaries, splits on non-alphanumeric
 * characters, removes empty parts, and lowercases each resulting term.
 *
 * @param {string} name - The input identifier or filename to split.
 * @returns {string[]} An array of lowercase terms extracted from the input.
 */
function splitNameIntoTerms(name) {
	return name
		.replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
		.split(/[^A-Za-z0-9]+/u)
		.filter(Boolean)
		.map((term) => term.toLowerCase());
}

/**
 * Finds the first blocked term present in a name.
 * @param {*} name - Value to inspect; converted to string and split into normalized terms.
 * @returns {string|undefined} The first blocked term if found, `undefined` otherwise.
 */
function findBlockedTerm(name) {
	return splitNameIntoTerms(String(name)).find((term) => blockedTerms.has(term));
}

/**
 * Reports a "vagueName" violation if `name` contains a blocked generic term.
 *
 * @param {RuleContext} context - ESLint rule context used to report the violation.
 * @param {ASTNode} node - The AST node to associate with the reported problem.
 * @param {string} name - The identifier or key value to inspect for blocked terms.
 * @param {string} kind - Human-readable kind used in the message (e.g., "Variable", "Function").
 */
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

/**
 * Traverse a binding pattern or identifier and report any blocked terms used in declared names.
 *
 * Traverses Identifier, ObjectPattern, ArrayPattern, and RestElement nodes to locate binding identifiers
 * and delegates reporting of vague names using the provided rule context and kind label.
 * @param {import("eslint").Rule.RuleContext} context - ESLint rule context used to report violations.
 * @param {import("estree").Node|null|undefined} node - The binding node or identifier to inspect.
 * @param {string} kind - Human-readable kind label (e.g., "Variable", "Parameter") used in report messages.
 */
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

/**
 * Report a blocked identifier name found on a declaration node.
 *
 * @param {import("eslint").RuleContext} context - ESLint rule context used to report violations.
 * @param {object} node - AST declaration node (may contain an `id` Identifier).
 * @param {string} kind - Human-readable kind label for the reported node (e.g., "Function", "Class").
 */
function checkDeclarationId(context, node, kind) {
	if (node?.id?.type === "Identifier") {
		reportName(context, node.id, node.id.name, kind);
	}
}

/**
 * Reports a vague/member name when the provided AST node's key is an identifier or a string literal.
 * @param {RuleContext} context - ESLint rule context.
 * @param {ASTNode} node - AST node containing a `key` property (e.g., Property, MethodDefinition, TSPropertySignature).
 * @param {string} kind - Human-readable kind label used in the reported message.
 */
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

/**
 * Determines whether an AST top-level statement should be treated as implementation code rather than a pure import/re-export.
 * @param {object} statement - An ESTree statement node (e.g., ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration).
 * @returns {boolean} `true` if the statement is considered implementation code; `false` for imports, `export *` declarations, or named exports that re-export from another module.
 */
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
				const fileName = stripKnownExtensions(getFileName(context.filename)).toLowerCase();
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
