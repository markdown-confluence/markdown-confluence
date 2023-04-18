import {
	ConfluenceAdfFile,
	ConfluenceNode,
	ConfluenceTreeNode,
	LocalAdfFile,
	LocalAdfFileTreeNode,
} from "./Publisher";
import { doc, p } from "@atlaskit/adf-utils/builders";
import { CustomConfluenceClient, LoaderAdaptor } from "./adaptors";

const blankPageAdf: string = JSON.stringify(doc(p("Page not published yet")));

function flattenTree(
	node: ConfluenceTreeNode,
	parentPageId?: string
): ConfluenceNode[] {
	const nodes: ConfluenceNode[] = [];
	const { file, version, existingAdf, children } = node;

	if (parentPageId) {
		nodes.push({
			file,
			version,
			existingAdf,
			parentPageId: parentPageId,
		});
	}

	if (children) {
		children.forEach((child) => {
			nodes.push(...flattenTree(child, file.pageId));
		});
	}

	return nodes;
}

export async function ensureAllFilesExistInConfluence(
	confluenceClient: CustomConfluenceClient,
	adaptor: LoaderAdaptor,
	node: LocalAdfFileTreeNode,
	spaceKey: string,
	parentPageId: string,
	topPageId: string
): Promise<ConfluenceNode[]> {
	const confluenceNode = await createFileStructureInConfluence(
		confluenceClient,
		adaptor,
		node,
		spaceKey,
		parentPageId,
		topPageId,
		false
	);

	const pages = flattenTree(confluenceNode);

	return pages;
}

async function createFileStructureInConfluence(
	confluenceClient: CustomConfluenceClient,
	adaptor: LoaderAdaptor,
	node: LocalAdfFileTreeNode,
	spaceKey: string,
	parentPageId: string,
	topPageId: string,
	createPage: boolean
): Promise<ConfluenceTreeNode> {
	if (!node.file) {
		throw new Error("Missing file on node");
	}

	let version: number;
	let existingAdf: string | undefined;
	const file: ConfluenceAdfFile = {
		...node.file,
		pageId: parentPageId,
		spaceKey,
	};

	if (createPage) {
		const pageDetails = await ensurePageExists(
			confluenceClient,
			adaptor,
			node.file,
			spaceKey,
			parentPageId,
			topPageId
		);
		file.pageId = pageDetails.id;
		file.spaceKey = pageDetails.spaceKey;
		version = pageDetails.version;
		existingAdf = pageDetails.existingAdf;
	} else {
		version = 0;
		existingAdf = "";
	}

	const childDetailsTasks = node.children.map((childNode) => {
		return createFileStructureInConfluence(
			confluenceClient,
			adaptor,
			childNode,
			spaceKey,
			file.pageId,
			topPageId,
			true
		);
	});

	const childDetails = await Promise.all(childDetailsTasks);

	return {
		file: file,
		version,
		existingAdf: existingAdf ?? "",
		children: childDetails,
	};
}

async function ensurePageExists(
	confluenceClient: CustomConfluenceClient,
	adaptor: LoaderAdaptor,
	file: LocalAdfFile,
	spaceKey: string,
	parentPageId: string,
	topPageId: string
) {
	if (file.pageId) {
		const contentById = await confluenceClient.content.getContentById({
			id: file.pageId,
			expand: ["version", "body.atlas_doc_format", "ancestors", "space"],
		});

		if (!contentById.space?.key) {
			throw new Error("Missing Space Key");
		}

		return {
			id: contentById.id,
			title: file.pageTitle,
			version: contentById?.version?.number ?? 1,
			existingAdf: contentById?.body?.atlas_doc_format?.value,
			spaceKey: contentById.space.key,
		};
	}

	const searchParams = {
		type: "page",
		spaceKey,
		title: file.pageTitle,
		expand: ["version", "body.atlas_doc_format", "ancestors"],
	};
	const contentByTitle = await confluenceClient.content.getContent(
		searchParams
	);

	if (contentByTitle.size > 0) {
		const currentPage = contentByTitle.results[0];

		if (
			!currentPage.ancestors?.some((ancestor) => ancestor.id == topPageId)
		) {
			throw new Error(
				`${file.pageTitle} is trying to overwrite a page outside the page tree from the selected top page`
			);
		}

		await adaptor.updateMarkdownPageId(
			file.absoluteFilePath,
			currentPage.id
		);
		return {
			id: currentPage.id,
			title: file.pageTitle,
			version: currentPage?.version?.number ?? 1,
			existingAdf: currentPage?.body?.atlas_doc_format?.value,
			spaceKey,
		};
	} else {
		const creatingBlankPageRequest = {
			space: { key: spaceKey },
			ancestors: [{ id: parentPageId }],
			title: file.pageTitle,
			type: "page",
			body: {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				atlas_doc_format: {
					value: blankPageAdf,
					representation: "atlas_doc_format",
				},
			},
		};
		const pageDetails = await confluenceClient.content.createContent(
			creatingBlankPageRequest
		);

		await adaptor.updateMarkdownPageId(
			file.absoluteFilePath,
			pageDetails.id
		);
		return {
			id: pageDetails.id,
			title: file.pageTitle,
			version: pageDetails?.version?.number ?? 1,
			existingAdf: pageDetails?.body?.atlas_doc_format?.value,
			spaceKey,
		};
	}
}
