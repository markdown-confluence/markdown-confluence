import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { ConfluenceSettings } from "./Settings";
import { MarkdownFile } from "./adaptors";
import { parseMarkdownToADF } from "./MdToADF";

export type PageContentType = "page" | "blogpost";

export type ConfluencePerPageConfig = {
	publish: FrontmatterConfig<boolean, "boolean">;
	pageTitle: FrontmatterConfig<string, "text">;
	frontmatterToPublish: FrontmatterConfig<string[], "array-text">;
	tags: FrontmatterConfig<string[], "array-text">;
	pageId: FrontmatterConfig<string | undefined, "text">;
	dontChangeParentPageId: FrontmatterConfig<boolean, "boolean">;
	blogPostDate: FrontmatterConfig<string | undefined, "text">;
	contentType: FrontmatterConfig<PageContentType, "options">;
};

export type InputType = "text" | "array-text" | "boolean" | "options";
export type InputValidator<IN> = (value: IN) => {
	valid: boolean;
	errors: Error[];
};

interface FrontmatterConfigBase<OUT> {
	key: string;
	default: OUT;
	alwaysProcess?: boolean;
	process: ProcessFunction<unknown, OUT>;
	inputType: InputType;
	inputValidator: InputValidator<unknown>;
}

type FrontmatterConfigOptions<OUT, T extends InputType> = T extends "options"
	? { selectOptions: OUT[] }
	: unknown;

export type FrontmatterConfig<
	OUT,
	T extends InputType,
> = FrontmatterConfigBase<OUT> & FrontmatterConfigOptions<OUT, T>;

type ProcessFunction<IN, OUT> = (
	value: IN,
	markdownFile: MarkdownFile,
	alreadyParsed: Partial<ConfluencePerPageValues>,
	settings: ConfluenceSettings,
	adfContent: JSONDocNode,
) => OUT | Error;

export type ConfluencePerPageAllValues = {
	[K in keyof ConfluencePerPageConfig]: ConfluencePerPageConfig[K]["default"]; // TODO: Accumlate Errors
};

type excludedProperties = "frontmatterToPublish";

export type ConfluencePerPageValues = Omit<
	{
		[K in keyof ConfluencePerPageConfig]: ConfluencePerPageConfig[K]["default"]; // TODO: Accumlate Errors
	},
	excludedProperties
>;

export const conniePerPageConfig: ConfluencePerPageConfig = {
	publish: {
		key: "connie-publish",
		default: false,
		inputType: "boolean",
		inputValidator: (value) => {
			switch (typeof value) {
				case "boolean":
					return { valid: true, errors: [] };
				default:
					return {
						valid: false,
						errors: [new Error("Publish should be a boolean.")],
					};
			}
		},
		process: (publish) => (typeof publish === "boolean" ? publish : false),
	},
	pageTitle: {
		key: "connie-title",
		default: "",
		alwaysProcess: true,
		inputType: "text",
		inputValidator: (value) => {
			switch (typeof value) {
				case "string":
					return {
						valid: true,
						errors: [],
					};
				default:
					return {
						valid: false,
						errors: [new Error("Title needs to be a string.")],
					};
			}
		},
		process: (
			yamlValue,
			markdownFile,
			_alreadyParsed,
			settings,
			adfContent,
		) => {
			if (typeof yamlValue === "string") {
				return yamlValue;
			}
			if (
				settings.firstHeadingPageTitle &&
				adfContent.content.at(0)?.type === "heading" &&
				adfContent.content.at(0)?.content?.at(0)?.type === "text" &&
				typeof adfContent.content.at(0)?.content?.at(0)?.text ===
					"string"
			) {
				// Get the first heading text content
				const firstHeadingText = adfContent.content
					.at(0)
					?.content?.at(0)?.text;

				// if firstHeadingText is truthy
				if (firstHeadingText) {
					// Remove the first heading from the content
					// as it will be used as the page title
					// and we don't want it in the body because it will be duplicated
					adfContent.content = adfContent.content.slice(1);
					// set the first heading text as the page title (return early)
					return firstHeadingText;
				}
			}
			return markdownFile.pageTitle;
		},
	},
	frontmatterToPublish: {
		key: "connie-frontmatter-to-publish",
		default: [],
		inputType: "array-text",
		inputValidator: () => {
			return {
				valid: true,
				errors: [],
			};
		},
		process: (
			yamlValue,
			markdownFile,
			_alreadyParsed,
			settings,
			adfContent,
		) => {
			if (yamlValue && Array.isArray(yamlValue)) {
				let frontmatterHeader =
					"| Key | Value | \n | ----- | ----- |\n";
				for (const key of yamlValue) {
					if (markdownFile.frontmatter[key]) {
						const keyString = key.toString();
						const valueString = JSON.stringify(
							markdownFile.frontmatter[key],
						);
						frontmatterHeader += `| ${keyString} | ${valueString} |\n`;
					}
				}

				const newADF = parseMarkdownToADF(
					frontmatterHeader,
					settings.confluenceBaseUrl,
				);

				adfContent.content = [...newADF.content, ...adfContent.content];
			}
			return [];
		},
	},
	tags: {
		key: "tags",
		default: [],
		inputType: "array-text",
		inputValidator: () => {
			return {
				valid: true,
				errors: [],
			};
		},
		process: (yamlValue) => {
			const tags: string[] = [];
			if (Array.isArray(yamlValue)) {
				for (const label of yamlValue) {
					if (typeof label === "string") {
						tags.push(label);
					}
				}
			}
			return tags;
		},
	},
	pageId: {
		key: "connie-page-id",
		default: undefined,
		inputType: "text",
		inputValidator: (value) => {
			const digitRegex = /^\d+$/;
			if (typeof value === "string" && digitRegex.test(value)) {
				return { valid: true, errors: [] };
			}
			return {
				valid: false,
				errors: [
					new Error(
						"Page ID needs to be a string and only can contain numbers",
					),
				],
			};
		},
		process: (yamlValue) => {
			let pageId: string | undefined;
			switch (typeof yamlValue) {
				case "string":
				case "number":
					pageId = yamlValue.toString();
					break;
				default:
					pageId = undefined;
			}
			return pageId;
		},
	},
	dontChangeParentPageId: {
		key: "connie-dont-change-parent-page",
		default: false,
		inputType: "boolean",
		inputValidator: () => {
			return {
				valid: true,
				errors: [],
			};
		},
		process: (dontChangeParentPageId) =>
			typeof dontChangeParentPageId === "boolean"
				? dontChangeParentPageId
				: false,
	},
	blogPostDate: {
		key: "connie-blog-post-date",
		default: undefined,
		inputType: "text",
		inputValidator: (yamlValue) => {
			if (typeof yamlValue !== "string") {
				return {
					valid: false,
					errors: [
						new Error(
							`Blog post date needs to be a string in the format of "YYYY-MM-DD".`,
						),
					],
				};
			}
			const blogPostDateValidation = validateDate(yamlValue);
			if (blogPostDateValidation.valid) {
				return { valid: true, errors: [] };
			} else {
				return {
					valid: false,
					errors: [
						new Error(
							`Blog post date error. ${blogPostDateValidation.reasons?.join()}`,
						),
					],
				};
			}
		},
		process: (yamlValue) => {
			if (typeof yamlValue === "string") {
				const blogPostDateValidation = validateDate(yamlValue);
				if (blogPostDateValidation.valid) {
					return yamlValue;
				} else {
					return new Error(
						`Blog post date error. ${blogPostDateValidation.reasons?.join()}`,
					);
				}
			}
			return new Error(`"connie-blog-post-date" needs to be a string.`);
		},
	},
	contentType: {
		key: "connie-content-type",
		default: "page",
		alwaysProcess: true,
		inputType: "options",
		selectOptions: ["page", "blogpost"],
		inputValidator: () => {
			return {
				valid: true,
				errors: [],
			};
		},
		process: (yamlValue, _markdownFile, alreadyParsed) => {
			if (yamlValue !== undefined && typeof yamlValue !== "string") {
				return Error(`Provided "connie-content-type" isn't a string.`);
			}

			if (
				typeof yamlValue === "string" &&
				!["page", "blogpost"].includes(yamlValue)
			) {
				return Error(
					`Provided "connie-content-type" isn't "page" or "blogpost".`,
				);
			}

			let contentType: PageContentType = "page";

			if (alreadyParsed.blogPostDate) {
				contentType = "blogpost";

				if (
					typeof yamlValue === "string" &&
					yamlValue !== contentType
				) {
					return Error(
						`When "connie-blog-post-date" is specified "connie-content-type" must be "blogpost" or not specified.`,
					);
				}
			}

			if (
				yamlValue !== undefined &&
				["page", "blogpost"].includes(yamlValue)
			) {
				contentType = yamlValue as PageContentType;
			}

			return contentType;
		},
	},
};

export function processConniePerPageConfig(
	markdownFile: MarkdownFile,
	settings: ConfluenceSettings,
	adfContent: JSONDocNode,
): ConfluencePerPageValues {
	const result: Partial<ConfluencePerPageValues> = {};
	const config = conniePerPageConfig;

	for (const propertyKey in config) {
		const {
			process,
			default: defaultValue,
			key,
			alwaysProcess,
		} = config[propertyKey as keyof ConfluencePerPageConfig];
		if (key in markdownFile.frontmatter || alwaysProcess) {
			const frontmatterValue = markdownFile.frontmatter[key];
			result[propertyKey as keyof ConfluencePerPageValues] = process(
				frontmatterValue as never,
				markdownFile,
				result,
				settings,
				adfContent,
			) as never;
		} else {
			result[propertyKey as keyof ConfluencePerPageValues] =
				defaultValue as never;
		}
	}

	return preventOverspreading(result, "frontmatterToPublish");
}

function preventOverspreading<T>(
	source: Partial<T>,
	...keysToOmit: excludedProperties[]
): T {
	const result: Partial<T> = {};

	for (const key in source) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if (!keysToOmit.includes(key as any)) {
			result[key as keyof T] = source[key];
		}
	}

	return result as T;
}

type ValidationResult = {
	valid: boolean;
	reasons?: string[];
};

function validateDate(dateString: string): ValidationResult {
	const reasons: string[] = [];

	// Regular expression to check the format: YYYY-MM-DD
	const regex = /^\d{4}-\d{2}-\d{2}$/;

	if (!regex.test(dateString)) {
		reasons.push("Invalid format");
	} else {
		const parts = dateString.split("-");
		const year = parseInt(parts[0] ?? "", 10);
		const month = parseInt(parts[1] ?? "", 10) - 1; // Date months are 0-based
		const day = parseInt(parts[2] ?? "", 10);

		if (year < 0 || year > 9999) {
			reasons.push("Invalid year");
		}

		if (month < 0 || month > 11) {
			reasons.push("Invalid month");
		}

		const date = new Date(year, month, day);

		if (
			date.getFullYear() !== year ||
			date.getMonth() !== month ||
			date.getDate() !== day
		) {
			reasons.push("Invalid day");
		}
	}

	if (reasons.length > 0) {
		return { valid: false, reasons };
	} else {
		return { valid: true };
	}
}
