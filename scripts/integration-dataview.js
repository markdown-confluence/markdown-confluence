import assert from "node:assert/strict";
import { Effect } from "effect";

const bibliographyPath = "Dataview Tests/Bibliography.md";
const paperPath = "Dataview Tests/Papers/Paper.md";
const contextPath = "Dataview Test Support/Context.md";
const markerField = "connie-dataview-test: true";

/** Invoked only by the explicit --dataview desktop profile, in its guarded test vault. */
export function runDataviewIntegration({ evaluate, get, prefix = `Desktop ${Date.now()} ` }) {
	return Effect.gen(function* () {
		const originalSettings = yield* evaluate(`
			const plugin = app.plugins.plugins['confluence-integration'];
			if (!app.plugins.plugins.dataview?.api?.queryMarkdown) throw Error('Install and enable Dataview in the dedicated test vault for --dataview');
			return JSON.stringify({renderDataview:plugin.settings.renderDataview,ignoredCodeBlockLanguages:plugin.settings.ignoredCodeBlockLanguages});
		`);
		const fixtures = {
			[bibliographyPath]: `---\n${markerField}\nconnie-publish: true\nconnie-title: ${prefix}Dataview bibliography\n---\n# Bibliography\n\n[[${paperPath}|Referenced paper]]\n\n\`\`\`dataview\nTABLE authors AS Authors\nFROM "Dataview Tests/Papers"\nWHERE contains(this.file.outlinks, file.link)\n\`\`\`\n\n\`\`\`dataview\nLIST FROM "Dataview Tests/Papers"\n\`\`\`\n\n\`\`\`dataview\nTASK FROM "Dataview Tests/Papers"\n\`\`\`\n\n![[${contextPath}#Context]]\n`,
			[paperPath]: `---\n${markerField}\nconnie-publish: true\nconnie-title: ${prefix}Dataview paper\nauthors: [Ada, Katherine]\n---\n# Paper\n\n- [ ] Read the paper\n- [x] Collect citation\n`,
			[contextPath]: `---\n${markerField}\nconnie-publish: false\nlabel: Embedded source context\n---\n# Context\n\n\`\`\`dataview\nTABLE WITHOUT ID this.label AS Context\nWHERE file.path = this.file.path\n\`\`\`\n\n# Excluded section\n\`\`\`dataview\nTHIS IS AN INVALID QUERY THAT MUST NEVER RUN\n\`\`\`\n`,
		};
		for (const [filename, markdown] of Object.entries(fixtures)) {
			yield* evaluate(`
				const filename = ${JSON.stringify(filename)};
				const existing = app.vault.getAbstractFileByPath(filename);
				if (existing) {
					if (!(await app.vault.read(existing)).includes(${JSON.stringify(markerField)})) throw Error('Refusing to replace an unowned Dataview fixture');
				} else {
					const parts = filename.split('/'); parts.pop(); let folder = '';
					for (const part of parts) { folder += (folder ? '/' : '') + part; if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder); }
					await app.vault.create(filename, ${JSON.stringify(markdown)});
				}
				return JSON.stringify({ready:true});
			`);
		}
		const read = (filename) =>
			evaluate(
				`return JSON.stringify(await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(filename)})));`,
			);
		const write = (filename, markdown) =>
			evaluate(
				`await app.vault.modify(app.vault.getAbstractFileByPath(${JSON.stringify(filename)}), ${JSON.stringify(markdown)}); return JSON.stringify({modified:true});`,
			);
		const publish = (filename) =>
			evaluate(`
			const result = await app.plugins.plugins['confluence-integration'].doPublish(${JSON.stringify(filename)});
			if (result.errorMessage || result.failedFiles.length || result.filesUploadResult.length !== 1) throw Error('Dataview desktop publication failed');
			return JSON.stringify({published:true});
		`);
		const page = (filename) =>
			Effect.gen(function* () {
				const source = yield* read(filename);
				const pageId = source.match(/^connie-page-id:\s*['"]?(\d+)/m)?.[1];
				assert.ok(pageId, `Missing Confluence ID in ${filename}`);
				const remote = yield* get(
					`content/${pageId}?expand=version,body.atlas_doc_format,space`,
				);
				return {
					id: pageId,
					version: remote.version.number,
					// Confluence refreshes resolved link titles asynchronously, without a page edit.
					body: JSON.parse(remote.body.atlas_doc_format.value, (key, value) =>
						key === "__confluenceMetadata" ? undefined : value,
					),
					spaceKey: remote.space.key,
				};
			});
		const result = yield* Effect.gen(function* () {
			yield* evaluate(`
				const plugin = app.plugins.plugins['confluence-integration'];
				plugin.settings.renderDataview = true;
				plugin.settings.ignoredCodeBlockLanguages = (plugin.settings.ignoredCodeBlockLanguages || []).filter(value => value.trim().toLowerCase() !== 'dataview');
				await plugin.saveSettings(); return JSON.stringify({enabled:true});
			`);
			yield* publish(paperPath);
			yield* publish(bibliographyPath);
			const first = yield* page(bibliographyPath);
			const paper = yield* page(paperPath);
			const walk = (node) => [node, ...(node.content ?? []).flatMap(walk)];
			const nodes = walk(first.body);
			assert.equal(nodes.filter((node) => node.type === "table").length, 2);
			assert.ok(nodes.some((node) => node.type === "bulletList"));
			assert.ok(
				nodes.some((node) => node.type === "taskItem" && node.attrs.state === "TODO"),
			);
			assert.ok(
				nodes.some((node) => node.type === "taskItem" && node.attrs.state === "DONE"),
			);
			const serialized = JSON.stringify(first.body);
			for (const text of ["Ada", "Katherine", "Embedded source context"])
				assert.ok(serialized.includes(text), `Missing ${text}`);
			assert.ok(!serialized.includes("wikilinks:"));
			assert.ok(!serialized.includes("<ul>"));
			assert.ok(
				!nodes.some(
					(node) => node.type === "codeBlock" && node.attrs?.language === "dataview",
				),
			);
			assert.ok(
				nodes.some((node) =>
					(
						node.attrs?.url ??
						node.marks?.find((mark) => mark?.type === "link")?.attrs.href ??
						""
					).includes(`/pages/${paper.id}`),
				),
			);
			const bibliographySource = yield* read(bibliographyPath);
			const paperSource = yield* read(paperPath);
			assert.ok(bibliographySource.includes("```dataview"));
			assert.ok(bibliographySource.includes("contains(this.file.outlinks, file.link)"));
			yield* publish(bibliographyPath);
			assert.deepEqual(
				yield* page(bibliographyPath),
				first,
				"Unchanged Dataview results changed the remote page",
			);
			let updated;
			yield* Effect.gen(function* () {
				assert.ok(
					paperSource.includes("Ada"),
					"Dataview fixture needs its original author restored",
				);
				yield* write(paperPath, paperSource.replace("Ada", "Grace"));
				// No delay: publication must wait for Dataview's asynchronous dependency indexing.
				yield* publish(bibliographyPath);
				updated = yield* page(bibliographyPath);
				assert.equal(updated.version, first.version + 1);
				assert.ok(JSON.stringify(updated.body).includes("Grace"));
				assert.ok(!JSON.stringify(updated.body).includes('"Ada"'));
				yield* write(
					bibliographyPath,
					bibliographySource + "\n```dataview\nINVALID QUERY\n```\n",
				);
				const failure = yield* evaluate(`
					try { await app.plugins.plugins['confluence-integration'].doPublish(${JSON.stringify(bibliographyPath)}); return JSON.stringify({failed:false}); }
					catch (error) { return JSON.stringify({failed:true, hasSource:String(error.message).includes(${JSON.stringify(bibliographyPath)})}); }
				`);
				assert.deepEqual(failure, { failed: true, hasSource: true });
				assert.deepEqual(
					yield* page(bibliographyPath),
					updated,
					"Invalid query changed the remote page",
				);
			}).pipe(
				Effect.ensuring(
					Effect.gen(function* () {
						yield* write(bibliographyPath, bibliographySource);
						yield* write(paperPath, paperSource);
						yield* publish(bibliographyPath);
					}),
				),
			);
			return {
				status: "passed",
				bibliographyId: first.id,
				paperId: paper.id,
				spaceKey: first.spaceKey,
				checks: [
					"native-table-list-task",
					"outgoing-paper-links",
					"embedded-source-context",
					"source-preserved",
					"unchanged",
					"dependency-update",
					"query-error-no-remote-update",
				],
			};
		}).pipe(
			Effect.ensuring(
				evaluate(`
			const plugin = app.plugins.plugins['confluence-integration']; Object.assign(plugin.settings, ${JSON.stringify(originalSettings)});
			await plugin.saveSettings(); return JSON.stringify({settingsRestored:true});
		`),
			),
		);
		return result;
	});
}
