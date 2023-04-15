import path from "path";
import { MarkdownFile } from "./adaptors/types";
import MdToADF from "./MdToADF";
import FolderFile from "./FolderFile.json";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { LocalAdfFileTreeNode } from "./Publisher";

const mdToADFConverter = new MdToADF();

const findCommonPath = (paths: string[]): string => {
	const [firstPath, ...rest] = paths;
	const commonPathParts = firstPath.split(path.sep);

	rest.forEach((filePath) => {
		const pathParts = filePath.split(path.sep);
		for (let i = 0; i < commonPathParts.length; i++) {
			if (pathParts[i] !== commonPathParts[i]) {
				commonPathParts.splice(i);
				break;
			}
		}
	});

	return commonPathParts.join(path.sep);
};

const createTreeNode = (name: string): LocalAdfFileTreeNode => ({
	name,
	children: [],
});

const addFileToTree = (
	treeNode: LocalAdfFileTreeNode,
	file: MarkdownFile,
	relativePath: string,
	fileNames: Set<string>
) => {
	const [folderName, ...remainingPath] = relativePath.split(path.sep);

	if (remainingPath.length === 0) {
		if (fileNames.has(file.fileName)) {
			throw new Error(
				`File name "${file.fileName}" is not unique across all folders.`
			);
		}
		fileNames.add(file.fileName);
		const adfFile = mdToADFConverter.convertMDtoADF(file);
		treeNode.children.push({
			...createTreeNode(folderName),
			file: adfFile,
		});
	} else {
		let childNode = treeNode.children.find(
			(node) => node.name === folderName
		);

		if (!childNode) {
			childNode = createTreeNode(folderName);
			treeNode.children.push(childNode);
		}

		addFileToTree(childNode, file, remainingPath.join(path.sep), fileNames);
	}
};

const processNode = (commonPath: string, node: LocalAdfFileTreeNode) => {
	if (!node.file) {
		const indexFile = node.children.find(
			(child) => path.parse(child.name).name === node.name
		);

		if (indexFile) {
			node.file = indexFile.file;
			node.children = node.children.filter(
				(child) => child !== indexFile
			);
		} else {
			node.file = {
				folderName: node.name,
				absoluteFilePath: path.join(commonPath, node.name),
				fileName: `${node.name}.md`,
				contents: FolderFile as JSONDocNode,
				pageTitle: node.name,
				frontmatter: {},
				tags: [],
				pageId: undefined,
				dontChangeParentPageId: false,
			};
		}
	}

	node.children.forEach((childNode) => processNode(commonPath, childNode));
};

export const createFolderStructure = (
	markdownFiles: MarkdownFile[]
): LocalAdfFileTreeNode => {
	const commonPath = findCommonPath(
		markdownFiles.map((file) => file.absoluteFilePath)
	);
	const rootNode = createTreeNode(commonPath);
	const fileNames = new Set<string>();

	markdownFiles.forEach((file) => {
		const relativePath = path.relative(commonPath, file.absoluteFilePath);
		addFileToTree(rootNode, file, relativePath, fileNames);
	});

	processNode(commonPath, rootNode);

	return rootNode;
};
