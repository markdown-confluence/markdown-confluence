/**
 * Minimal type definitions for the Confluence Cloud REST API v2 responses and
 * request bodies used by {@link ConfluenceV2Client}. These cover only the
 * fields the publisher relies on; the full v2 schema is much larger.
 *
 * @see https://developer.atlassian.com/cloud/confluence/rest/v2/
 */

/** A v2 page version block. */
export type V2Version = {
	number: number;
	authorId?: string;
	message?: string;
	createdAt?: string;
};

/** A v2 body representation block (e.g. `atlas_doc_format`). */
export type V2BodyRepresentation = {
	value?: string;
	representation?: string;
};

/** The `body` block returned by v2 page endpoints. */
export type V2PageBody = {
	storage?: V2BodyRepresentation;
	atlas_doc_format?: V2BodyRepresentation;
	view?: V2BodyRepresentation;
};

/** A v2 page object (subset of fields). */
export type V2Page = {
	id: string;
	status: string;
	title: string;
	spaceId: string;
	parentId?: string | null;
	parentType?: string | null;
	authorId?: string;
	ownerId?: string;
	version?: V2Version;
	body?: V2PageBody;
};

/** A v2 multi-entity result wrapper. */
export type V2MultiEntityResult<T> = {
	results: T[];
	_links?: {
		next?: string;
		base?: string;
	};
};

/** A v2 ancestor entry (minimal shape returned by the ancestors endpoint). */
export type V2Ancestor = {
	id: string;
	type: string;
};

/** A v2 space object (subset of fields). */
export type V2Space = {
	id: string;
	key: string;
	name?: string;
};

/** Request body for `POST /wiki/api/v2/pages`. */
export type V2CreatePageBody = {
	spaceId: string;
	status: string;
	title: string;
	parentId?: string;
	body: {
		representation: string;
		value: string;
	};
};

/** Request body for `PUT /wiki/api/v2/pages/{id}`. */
export type V2UpdatePageBody = {
	id: string;
	status: string;
	title: string;
	parentId?: string;
	body: {
		representation: string;
		value: string;
	};
	version: {
		number: number;
		message?: string;
	};
};

/** A v2 attachment object (subset of fields). */
export type V2Attachment = {
	id: string;
	title: string;
	mediaType?: string;
	comment?: string;
	fileId?: string;
	fileSize?: number;
};

/** A v2 label object (subset of fields). */
export type V2Label = {
	id: string;
	name: string;
	prefix?: string;
};
