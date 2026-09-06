import { Api, Client } from "confluence.js";

export interface RequiredConfluenceClient extends Client {
	content: Api.Content;
	space: Api.Space;
	contentAttachments: Api.ContentAttachments;
	contentLabels: Api.ContentLabels;
	users: Api.Users;
}
