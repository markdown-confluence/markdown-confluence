import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { Path } from "effect/Path";
import { NodePath } from "@effect/platform-node";
import { Effect } from "effect";
import { folderFile } from "./FolderFile";
import { convertMDtoADF } from "./MdToADF";
import { LocalAdfFileTreeNode } from "./Publisher";
import { ConfluenceSettings } from "./Settings";
import { MarkdownFile } from "./MarkdownWorkspace";

const findTreeRootPath = (paths: string[], path: Path): string => {
	const [firstPath, ...rest] = paths;
	if (!firstPath) {
		throw new Error("No Paths Provided");
	}
	const treeRootPathParts = firstPath.split(path.sep);

	rest.forEach((filePath) => {
		const pathParts = filePath.split(path.sep);
		for (let i = 0; i < treeRootPathParts.length; i++) {
			if (pathParts[i] !== treeRootPathParts[i]) {
				treeRootPathParts.splice(i);
				break;
			}
		}
	});

	const treeRootPath = treeRootPathParts.join(path.sep);
	if (paths.some((filePath) => path.relative(treeRootPath, filePath) === "")) {
		return path.dirname(treeRootPath);
	}
	return treeRootPath;
};

const createTreeNode = (name: string): LocalAdfFileTreeNode => ({
	name,
	children: [],
});

const folderNoteFileNames = ["index", "README", "readme"];

const resolveTreeNodePath = (contentRootPath: string, nodeName: string, path: Path): string => {
	if (nodeName === contentRootPath) {
		return nodeName;
	}
	return path.join(contentRootPath, nodeName);
};

const addFileToTree = (
	treeNode: LocalAdfFileTreeNode,
	file: MarkdownFile,
	relativePath: string,
	settings: ConfluenceSettings,
	path: Path,
) => {
	const [folderName, ...remainingPath] = relativePath.split(path.sep);
	if (folderName === undefined) {
		throw new Error("Unable to get folder name");
	}

	if (remainingPath.length === 0) {
		const adfFile = convertMDtoADF(file, settings);
		treeNode.children.push({
			...createTreeNode(folderName),
			file: adfFile,
		});
	} else {
		let childNode = treeNode.children.find((node) => node.name === folderName);

		if (!childNode) {
			childNode = createTreeNode(folderName);
			treeNode.children.push(childNode);
		}

		addFileToTree(childNode, file, remainingPath.join(path.sep), settings, path);
	}
};

const processNode = (treeRootPath: string, node: LocalAdfFileTreeNode, path: Path) => {
	if (!node.file) {
		const nodePageTitle = path.basename(node.name);
		let indexFile = node.children.find(
			(child) => path.parse(child.name).name === nodePageTitle,
		);
		if (!indexFile) {
			// Support FolderFile with file names such as "index.md" and "README.md".
			indexFile = folderNoteFileNames
				.map((fileName) =>
					node.children.find((child) => path.parse(child.name).name === fileName),
				)
				.find((child) => child !== undefined);
		}

		if (indexFile && indexFile.file) {
			node.file = withFolderNotePageTitle(indexFile.file, nodePageTitle, path);
			node.children = node.children.filter((child) => child !== indexFile);
		} else {
			node.file = {
				folderName: node.name,
				absoluteFilePath: resolveTreeNodePath(treeRootPath, node.name, path),
				fileName: `${node.name}.md`,
				contents: folderFile as JSONDocNode,
				pageTitle: node.name,
				frontmatter: {},
				tags: [],
				pageId: undefined,
				dontChangeParentPageId: false,
				contentType: "page",
				blogPostDate: undefined,
			};
		}
	}

	const nodeFile = node.file;
	if (!nodeFile) {
		throw new Error("Missing file on node");
	}
	const childTreeRootPath =
		nodeFile.contents === (folderFile as JSONDocNode)
			? nodeFile.absoluteFilePath
			: path.parse(nodeFile.absoluteFilePath).dir;

	node.children.forEach((childNode) => processNode(childTreeRootPath, childNode, path));
};

function withFolderNotePageTitle(
	file: NonNullable<LocalAdfFileTreeNode["file"]>,
	nodePageTitle: string,
	path: Path,
): NonNullable<LocalAdfFileTreeNode["file"]> {
	if (!nodePageTitle) {
		return file;
	}

	const fileTitle = path.parse(file.fileName).name;
	const shouldUseFolderTitle =
		folderNoteFileNames.includes(fileTitle) &&
		file.pageTitle === fileTitle &&
		typeof file.frontmatter["connie-title"] !== "string";

	return shouldUseFolderTitle ? { ...file, pageTitle: nodePageTitle } : file;
}

export const createFolderStructure = (
	markdownFiles: MarkdownFile[],
	settings: ConfluenceSettings,
): LocalAdfFileTreeNode => {
	return Effect.runSync(
		createFolderStructureEffect(markdownFiles, settings).pipe(Effect.provide(NodePath.layer)),
	);
};

export const createFolderStructureEffect = (
	markdownFiles: MarkdownFile[],
	settings: ConfluenceSettings,
): Effect.Effect<LocalAdfFileTreeNode, Error, Path> =>
	Effect.gen(function* () {
		const path = yield* Path;
		const treeRootPath = findTreeRootPath(
			markdownFiles.map((file) => file.absoluteFilePath),
			path,
		);
		const rootNode = createTreeNode(treeRootPath);

		markdownFiles.forEach((file) => {
			const relativePath = path.relative(treeRootPath, file.absoluteFilePath);
			addFileToTree(rootNode, file, relativePath, settings, path);
		});

		processNode(treeRootPath, rootNode, path);

		checkUniquePageTitle(rootNode);

		return rootNode;
	}).pipe(Effect.mapError(toError));

function checkUniquePageTitle(
	rootNode: LocalAdfFileTreeNode,
	pageTitles: Map<string, NonNullable<LocalAdfFileTreeNode["file"]>[]> = new Map(),
) {
	const currentFile = rootNode.file;

	if (!currentFile) {
		rootNode.children.forEach((child) => checkUniquePageTitle(child, pageTitles));
		return;
	}

	const currentPageTitle = currentFile.pageTitle;
	const existingFiles = pageTitles.get(currentPageTitle) ?? [];

	if (
		existingFiles.length > 0 &&
		!existingFiles.concat(currentFile).every((file) => file.pageId)
	) {
		throw new Error(`Page title "${currentPageTitle}" is not unique across all files.`);
	}

	pageTitles.set(currentPageTitle, existingFiles.concat(currentFile));
	rootNode.children.forEach((child) => checkUniquePageTitle(child, pageTitles));
}

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	return new Error(typeof error === "string" ? error : JSON.stringify(error));
}
