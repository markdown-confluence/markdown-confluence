import { MarkdownFile } from "./adaptors";

export type PageContentType = "page" | "blogpost";

type ConfluencePerPageConfig = {
	pageTitle: FrontmatterConfig<string>;
	frontmatterToPublish: FrontmatterConfig<undefined>;
	tags: FrontmatterConfig<string[]>;
	pageId: FrontmatterConfig<string | undefined>;
	dontChangeParentPageId: FrontmatterConfig<boolean>;
	blogPostDate: FrontmatterConfig<string | undefined>;
	contentType: FrontmatterConfig<PageContentType>;
};

interface FrontmatterConfig<OUT> {
	key: string;
	default: OUT;
	alwaysProcess?: boolean;
	process: ProcessFunction<unknown, OUT>;
}

type ProcessFunction<IN, OUT> = (
	value: IN,
	markdownFile: MarkdownFile,
	alreadyParsed: Partial<ConfluencePerPageValues>
) => OUT | Error;

type excludedProperties = "frontmatterToPublish";

export type ConfluencePerPageValues = Omit<
	{
		[K in keyof ConfluencePerPageConfig]: ConfluencePerPageConfig[K]["default"]; // TODO: Accumlate Errors
	},
	excludedProperties
>;

export function processConniePerPageConfig(
	markdownFile: MarkdownFile
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
				result
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
		const year = parseInt(parts[0], 10);
		const month = parseInt(parts[1], 10) - 1; // Date months are 0-based
		const day = parseInt(parts[2], 10);

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

export const conniePerPageConfig: ConfluencePerPageConfig = {
	pageTitle: {
		key: "connie-title",
		default: "",
		alwaysProcess: true,
		process: (yamlValue, markdownFile) => {
			return typeof yamlValue === "string"
				? yamlValue
				: markdownFile.pageTitle;
		},
	},
	frontmatterToPublish: {
		key: "connie-frontmatter-to-publish",
		default: undefined,
		process: (yamlValue, markdownFile) => {
			if (yamlValue && Array.isArray(yamlValue)) {
				let frontmatterHeader =
					"| Key | Value | \n | ----- | ----- |\n";
				for (const key of yamlValue) {
					if (markdownFile.frontmatter[key]) {
						const keyString = key.toString();
						const valueString = JSON.stringify(
							markdownFile.frontmatter[key]
						);
						frontmatterHeader += `| ${keyString} | ${valueString} |\n`;
					}
				}
				markdownFile.contents =
					frontmatterHeader + markdownFile.contents;
			}
			return undefined;
		},
	},
	tags: {
		key: "tags",
		default: [],
		process: (yamlValue, markdownFile) => {
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
		process: (yamlValue, markdownFile) => {
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
		process: (dontChangeParentPageId) =>
			typeof dontChangeParentPageId === "boolean"
				? dontChangeParentPageId
				: false,
	},
	blogPostDate: {
		key: "connie-blog-post-date",
		default: undefined,
		process: (yamlValue: string) => {
			const blogPostDateValidation = validateDate(yamlValue);
			if (blogPostDateValidation.valid) {
				return yamlValue;
			} else {
				return new Error(
					`Blog post date error. ${blogPostDateValidation.reasons?.join()}`
				);
			}
		},
	},
	contentType: {
		key: "connie-content-type",
		default: "page",
		alwaysProcess: true,
		process: (yamlValue, markdownFile, alreadyParsed) => {
			if (yamlValue !== undefined && typeof yamlValue !== "string") {
				return Error(`Provided "connie-content-type" isn't a string.`);
			}

			if (
				typeof yamlValue === "string" &&
				!["page", "blogpost"].includes(yamlValue)
			) {
				return Error(
					`Provided "connie-content-type" isn't "page" or "blogpost".`
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
						`When "connie-blog-post-date" is specified "connie-content-type" must be "blogpost" or not specified.`
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
