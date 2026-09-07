/** Injectable transport for OAuth and Cloud API requests. Must honor aborts and reject redirects. */
export type ConfluenceFetch = (
	url: string,
	init: RequestInit,
) => Promise<
	Pick<Response, "ok" | "status" | "statusText" | "text" | "json"> & { headers?: Headers }
>;
