import {
	Api,
	Callback,
	Client,
	Config,
	RequestConfig,
	AuthenticationService,
} from "confluence.js";
import { requestUrl } from "obsidian";

const ATLASSIAN_TOKEN_CHECK_FLAG = "X-Atlassian-Token";
const ATLASSIAN_TOKEN_CHECK_NOCHECK_VALUE = "no-check";

export class MyBaseClient implements Client {
	protected urlSuffix = "/wiki/rest";

	constructor(protected readonly config: Config) {}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected paramSerializer(parameters: Record<string, any>): string {
		const parts: string[] = [];

		Object.entries(parameters).forEach(([key, value]) => {
			if (value === null || typeof value === "undefined") {
				return;
			}

			if (Array.isArray(value)) {
				// eslint-disable-next-line no-param-reassign
				value = value.join(",");
			}

			if (value instanceof Date) {
				// eslint-disable-next-line no-param-reassign
				value = value.toISOString();
			} else if (value !== null && typeof value === "object") {
				// eslint-disable-next-line no-param-reassign
				value = JSON.stringify(value);
			} else if (value instanceof Function) {
				const part = value();

				return part && parts.push(part);
			}

			parts.push(`${this.encode(key)}=${this.encode(value)}`);

			return;
		});

		return parts.join("&");
	}

	protected encode(value: string) {
		return encodeURIComponent(value)
			.replace(/%3A/gi, ":")
			.replace(/%24/g, "$")
			.replace(/%2C/gi, ",")
			.replace(/%20/g, "+")
			.replace(/%5B/gi, "[")
			.replace(/%5D/gi, "]");
	}

	protected removeUndefinedProperties(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		obj: Record<string, any>
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	): Record<string, any> {
		return Object.entries(obj)
			.filter(([, value]) => typeof value !== "undefined")
			.reduce(
				(accumulator, [key, value]) => ({
					...accumulator,
					[key]: value,
				}),
				{}
			);
	}

	async sendRequest<T>(
		requestConfig: RequestConfig,
		callback: never,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		telemetryData?: any
	): Promise<T>;
	async sendRequest<T>(
		requestConfig: RequestConfig,
		callback: Callback<T>,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		telemetryData?: any
	): Promise<void>;
	async sendRequest<T>(
		requestConfig: RequestConfig,
		callback: Callback<T> | never
	): Promise<void | T> {
		try {
			console.info({ requestConfig });

			if (requestConfig?.headers?.hasOwnProperty("content-type")) {
				requestConfig.headers["Content-Type"] =
					requestConfig?.headers["content-type"].toString();
				delete requestConfig?.headers["content-type"];
			}

			console.info({ requestConfig });

			const params = this.paramSerializer(requestConfig.params);

			const requestContentType =
				requestConfig?.headers?.hasOwnProperty("Content-Type") &&
				requestConfig?.headers["Content-Type"]
					.toString()
					.startsWith("multipart/form-data")
					? requestConfig?.headers["Content-Type"].toString()
					: "application/json";
			const requestBody =
				requestConfig?.headers?.hasOwnProperty("Content-Type") &&
				requestConfig?.headers["Content-Type"]
					.toString()
					.startsWith("multipart/form-data")
					? [
							requestConfig.data.getHeaders(),
							requestConfig.data.getBuffer().buffer,
					  ]
					: [{}, JSON.stringify(requestConfig.data)];

			const modifiedRequestConfig = {
				...requestConfig,
				headers: this.removeUndefinedProperties({
					"User-Agent": "Obsidian.md",
					Accept: "application/json",
					[ATLASSIAN_TOKEN_CHECK_FLAG]: this.config
						.noCheckAtlassianToken
						? ATLASSIAN_TOKEN_CHECK_NOCHECK_VALUE
						: undefined,
					...this.config.baseRequestConfig?.headers,
					Authorization:
						await AuthenticationService.getAuthenticationToken(
							this.config.authentication,
							{
								// eslint-disable-next-line @typescript-eslint/naming-convention
								baseURL: this.config.host,
								url: `${this.config.host}${this.urlSuffix}`,
								method: requestConfig.method ?? "GET",
							}
						),
					...requestConfig.headers,
					"Content-Type": requestContentType,
					...requestBody[0],
				}),
				url: `${this.config.host}${this.urlSuffix}${requestConfig.url}?${params}`,
				body: requestBody[1],
				method: requestConfig.method?.toUpperCase(),
				contentType: requestContentType,
				throw: true,
			};
			delete modifiedRequestConfig.data;

			console.log({ modifiedRequestConfig });
			const response = await requestUrl(modifiedRequestConfig);

			console.log({
				response,
				request: modifiedRequestConfig,
				requestConfig,
			});

			const callbackResponseHandler =
				callback && ((data: T): void => callback(null, data));
			const defaultResponseHandler = (data: T): T => data;

			const responseHandler =
				callbackResponseHandler ?? defaultResponseHandler;

			this.config.middlewares?.onResponse?.(response.json);

			return responseHandler(response.json);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (e: any) {
			console.log({ httpError: e, requestConfig });
			const err =
				this.config.newErrorHandling && e.isAxiosError
					? e.response.data
					: e;

			const callbackErrorHandler =
				callback && ((error: Config.Error) => callback(error));
			const defaultErrorHandler = (error: Error) => {
				throw error;
			};

			const errorHandler = callbackErrorHandler ?? defaultErrorHandler;

			this.config.middlewares?.onError?.(err);

			return errorHandler(err);
		}
	}
}

export class CustomConfluenceClient extends MyBaseClient {
	content = new Api.Content(this);
	space = new Api.Space(this);
	contentAttachments = new Api.ContentAttachments(this);
	contentLabels = new Api.ContentLabels(this);
}
