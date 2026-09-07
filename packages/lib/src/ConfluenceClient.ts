import type { Client } from "confluence.js/core";
import type { createV1Client } from "confluence.js";
import type { ConfluenceV2Client } from "./ConfluenceV2Client";

/** Publisher-facing page model, independent of the REST version. */
export interface ConfluenceContent {
	id: string;
	type: string;
	status: string;
	title: string;
	space?: { key: string };
	version?: { number: number; by?: { accountId?: string } };
	ancestors?: { id: string }[];
	body?: { atlas_doc_format?: { value: string; representation: string } };
}
export interface ContentQuery {
	type?: string;
	spaceKey?: string;
	title?: string;
	expand?: string | string[];
}
export interface ContentById {
	id: string;
	expand?: string | string[];
}
export interface ContentWrite {
	id?: string;
	type?: string;
	title?: string;
	space?: { key: string };
	ancestors?: { id: string }[];
	body?: ConfluenceContent["body"];
	expand?: string | string[];
}
export interface ContentUpdate extends ContentWrite {
	id: string;
	title: string;
	version: { number: number; message?: string };
}
export interface ContentArray {
	results: ConfluenceContent[];
	start: number;
	limit: number;
	size: number;
	_links: { self: string };
}
export interface AttachmentArray {
	results: {
		id: string;
		title: string;
		metadata: { comment: string };
		extensions: { fileId: string; collectionName: string };
		version?: { number: number; by?: { accountId?: string } };
	}[];
}
export interface LabelArray {
	results: { id: string; name: string; label: string; prefix: string }[];
}
type V1Client = ReturnType<typeof createV1Client>;
export interface RequiredConfluenceClient extends Client {
	content: Pick<
		ConfluenceV2Client,
		"getContent" | "getContentById" | "createContent" | "updateContent"
	>;
	contentAttachments: Pick<ConfluenceV2Client, "getAttachments">;
	contentLabels: Pick<ConfluenceV2Client, "getLabelsForContent"> &
		Pick<
			V1Client["contentLabels"],
			"addLabelsToContent" | "removeLabelFromContentUsingQueryParameter"
		>;
	users: { getCurrentUser(): Promise<{ accountId: string }> };
}
