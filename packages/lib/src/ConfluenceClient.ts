import { Api } from "confluence.js";

export interface RequiredConfluenceClient {
	content: Api.Content;
	space: Api.Space;
	contentAttachments: Api.ContentAttachments;
	contentLabels: Api.ContentLabels;
	users: Api.Users;
}
