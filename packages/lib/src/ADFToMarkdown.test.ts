/* eslint-disable @typescript-eslint/naming-convention */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { expect, test } from "@jest/globals";
import { renderADFDoc } from "./ADFToMarkdown";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";

const ADFToMDTest = {
	type: "doc",
	content: [
		{
			type: "paragraph",
			content: [
				{
					type: "inlineCard",
					attrs: {
						url: "https://testing.com/",
					},
				},
				{
					text: " ",
					type: "text",
				},
			],
		},
		{
			type: "paragraph",
			content: [
				{
					type: "inlineCard",
					attrs: {
						url: "https://andymac4182.atlassian.net/wiki/spaces/T2/pages/8290305",
					},
				},
				{
					text: " ",
					type: "text",
				},
			],
		},
		{
			type: "decisionList",
			attrs: {
				localId: "39becc7a-48c3-4e2d-a6bc-35648d6689a2",
			},
			content: [
				{
					type: "decisionItem",
					attrs: {
						state: "DECIDED",
						localId: "95268b83-2fc0-4801-9b4f-e5c42cc530e6",
					},
					content: [
						{
							text: "Decision to track",
							type: "text",
						},
					],
				},
				{
					type: "decisionItem",
					attrs: {
						state: "DECIDED",
						localId: "564ab974-e6fe-48d2-a144-507f5ec30906",
					},
					content: [
						{
							text: "Testing Decision 2",
							type: "text",
						},
					],
				},
			],
		},
		{
			type: "paragraph",
			content: [
				{
					type: "date",
					attrs: {
						timestamp: "1683244800000",
					},
				},
				{
					text: " ",
					type: "text",
				},
			],
		},
		{
			type: "table",
			attrs: {
				layout: "default",
				localId: "239ebaeb-0f55-4f40-b28e-b0982b4cc577",
			},
			content: [
				{
					type: "tableRow",
					content: [
						{
							type: "tableHeader",
							attrs: {
								colspan: 1,
								rowspan: 1,
								colwidth: [226.67],
							},
							content: [
								{
									type: "paragraph",
									content: [
										{
											text: "Testing",
											type: "text",
											marks: [
												{
													type: "strong",
												},
											],
										},
									],
								},
							],
						},
						{
							type: "tableHeader",
							attrs: {
								colspan: 1,
								rowspan: 1,
								colwidth: [226.67],
							},
							content: [
								{
									type: "paragraph",
									marks: [
										{
											type: "alignment",
											attrs: {
												align: "end",
											},
										},
									],
									content: [
										{
											text: "Testing 2",
											type: "text",
											marks: [
												{
													type: "strong",
												},
											],
										},
									],
								},
							],
						},
						{
							type: "tableHeader",
							attrs: {
								colspan: 1,
								rowspan: 1,
								colwidth: [226.67],
							},
							content: [
								{
									type: "paragraph",
									content: [
										{
											text: "Testing 3",
											type: "text",
											marks: [
												{
													type: "strong",
												},
											],
										},
									],
								},
							],
						},
					],
				},
				{
					type: "tableRow",
					content: [
						{
							type: "tableCell",
							attrs: {
								colspan: 1,
								rowspan: 1,
								colwidth: [226.67],
							},
							content: [
								{
									type: "paragraph",
									content: [
										{
											text: "Row 1",
											type: "text",
										},
									],
								},
							],
						},
						{
							type: "tableCell",
							attrs: {
								colspan: 1,
								rowspan: 1,
								colwidth: [226.67],
							},
							content: [
								{
									type: "paragraph",
									marks: [
										{
											type: "alignment",
											attrs: {
												align: "end",
											},
										},
									],
									content: [
										{
											text: "Row 1.2",
											type: "text",
										},
									],
								},
							],
						},
						{
							type: "tableCell",
							attrs: {
								colspan: 1,
								rowspan: 1,
								colwidth: [226.67],
							},
							content: [
								{
									type: "paragraph",
									content: [
										{
											text: "Row 1.3",
											type: "text",
										},
									],
								},
							],
						},
					],
				},
				{
					type: "tableRow",
					content: [
						{
							type: "tableCell",
							attrs: {
								colspan: 1,
								rowspan: 1,
								colwidth: [226.67],
							},
							content: [
								{
									type: "paragraph",
									content: [
										{
											text: "Row 2.1",
											type: "text",
										},
									],
								},
							],
						},
						{
							type: "tableCell",
							attrs: {
								colspan: 1,
								rowspan: 1,
								colwidth: [226.67],
							},
							content: [
								{
									type: "paragraph",
									marks: [
										{
											type: "alignment",
											attrs: {
												align: "end",
											},
										},
									],
									content: [
										{
											text: "Row 2.2",
											type: "text",
										},
									],
								},
							],
						},
						{
							type: "tableCell",
							attrs: {
								colspan: 1,
								rowspan: 1,
								colwidth: [226.67],
							},
							content: [
								{
									type: "paragraph",
									content: [
										{
											text: "Row 2.3",
											type: "text",
										},
									],
								},
							],
						},
					],
				},
			],
		},
		{
			type: "paragraph",
			content: [
				{
					text: "Testing ",
					type: "text",
				},
				{
					text: "TESTING",
					type: "text",
					marks: [
						{
							type: "em",
						},
						{
							type: "link",
							attrs: {
								href: "https://www.google.com/webmasters/tools/siteoverview",
							},
						},
					],
				},
				{
					type: "hardBreak",
				},
				{
					text: "Testing ",
					type: "text",
				},
				{
					text: "New",
					type: "text",
					marks: [
						{
							type: "strong",
						},
					],
				},
				{
					text: " Line",
					type: "text",
				},
			],
		},
		{
			type: "paragraph",
			marks: [
				{
					type: "indentation",
					attrs: {
						level: 1,
					},
				},
			],
			content: [
				{
					text: "sdfsdf",
					type: "text",
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "paragraph",
			content: [
				{
					text: "TESTING",
					type: "text",
					marks: [
						{
							type: "strong",
						},
						{
							type: "em",
						},
					],
				},
			],
		},
		{
			type: "rule",
		},
		{
			type: "paragraph",
			content: [
				{
					text: "TESTING BELOW",
					type: "text",
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "heading",
			attrs: {
				level: 1,
			},
			content: [
				{
					text: "Testing Header 1",
					type: "text",
				},
			],
		},
		{
			type: "heading",
			attrs: {
				level: 2,
			},
			content: [
				{
					text: "Header 2",
					type: "text",
				},
			],
		},
		{
			type: "heading",
			attrs: {
				level: 3,
			},
			content: [
				{
					text: "Heading 3",
					type: "text",
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "heading",
			attrs: {
				level: 4,
			},
			content: [
				{
					text: "Heading 4",
					type: "text",
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "heading",
			attrs: {
				level: 5,
			},
			content: [
				{
					text: "Heading 5",
					type: "text",
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "heading",
			attrs: {
				level: 6,
			},
			content: [
				{
					text: "Heading 6",
					type: "text",
					marks: [
						{
							type: "strong",
						},
					],
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "codeBlock",
			attrs: {
				language: "ada",
			},
			content: [
				{
					text: "TESTING CODE",
					type: "text",
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "bulletList",
			content: [
				{
					type: "listItem",
					content: [
						{
							type: "paragraph",
							content: [
								{
									text: "Testing Bullets",
									type: "text",
								},
							],
						},
					],
				},
				{
					type: "listItem",
					content: [
						{
							type: "paragraph",
							content: [
								{
									text: "Testing Bullets 2",
									type: "text",
								},
							],
						},
					],
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "orderedList",
			attrs: {
				order: 1,
			},
			content: [
				{
					type: "listItem",
					content: [
						{
							type: "paragraph",
							content: [
								{
									text: "Testing Numbered List",
									type: "text",
								},
							],
						},
					],
				},
				{
					type: "listItem",
					content: [
						{
							type: "paragraph",
							content: [
								{
									text: "Testing Numbered List 2",
									type: "text",
								},
							],
						},
					],
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "blockquote",
			content: [
				{
					type: "paragraph",
					content: [
						{
							text: "Testing Block Quote",
							type: "text",
						},
					],
				},
				{
					type: "paragraph",
					content: [
						{
							text: "Multiple Lines",
							type: "text",
						},
					],
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "panel",
			attrs: {
				panelType: "info",
			},
			content: [
				{
					type: "paragraph",
					content: [
						{
							text: "Testing Info Panel",
							type: "text",
						},
					],
				},
			],
		},
		{
			type: "panel",
			attrs: {
				panelType: "note",
			},
			content: [
				{
					type: "paragraph",
					content: [
						{
							text: "Testing Note Panel",
							type: "text",
						},
					],
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "expand",
			attrs: {
				title: "Expand Title",
			},
			content: [
				{
					type: "paragraph",
					content: [
						{
							text: "Testing expanded expand",
							type: "text",
						},
					],
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "expand",
			attrs: {
				title: "Closed Expand",
			},
			content: [
				{
					type: "paragraph",
					content: [
						{
							text: "Closed Expand",
							type: "text",
						},
					],
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "paragraph",
			content: [
				{
					text: "Testing ",
					type: "text",
				},
				{
					text: "Text",
					type: "text",
					marks: [
						{
							type: "strike",
						},
					],
				},
				{
					text: " ",
					type: "text",
				},
				{
					text: "Again ",
					type: "text",
					marks: [
						{
							type: "subsup",
							attrs: {
								type: "sub",
							},
						},
					],
				},
				{
					text: "Testing More",
					type: "text",
					marks: [
						{
							type: "subsup",
							attrs: {
								type: "sup",
							},
						},
					],
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "paragraph",
			content: [
				{
					type: "mention",
					attrs: {
						id: "557058:aea5688c-52b9-4d15-aabe-96def1abc413",
						text: "@Andrew McClenaghan",
					},
				},
				{
					text: " ",
					type: "text",
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "paragraph",
			content: [
				{
					text: "testing",
					type: "text",
					marks: [
						{
							type: "code",
						},
					],
				},
				{
					text: "code",
					type: "text",
				},
			],
		},
		{
			type: "taskList",
			attrs: {
				localId: "",
			},
			content: [
				{
					type: "taskItem",
					attrs: {
						state: "TODO",
						localId: "1",
					},
					content: [
						{
							text: "Testing ",
							type: "text",
						},
						{
							type: "mention",
							attrs: {
								id: "557058:aea5688c-52b9-4d15-aabe-96def1abc413",
								text: "@Andrew McClenaghan",
							},
						},
						{
							text: " ",
							type: "text",
						},
					],
				},
				{
					type: "taskItem",
					attrs: {
						state: "DONE",
						localId: "2",
					},
					content: [
						{
							text: "Testing 2",
							type: "text",
						},
					],
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "panel",
			attrs: {
				panelType: "info",
			},
			content: [
				{
					type: "bulletList",
					content: [
						{
							type: "listItem",
							content: [
								{
									type: "paragraph",
									content: [
										{
											text: "Bullet List in Panel",
											type: "text",
										},
									],
								},
							],
						},
					],
				},
				{
					type: "paragraph",
					content: [
						{
							text: "asdf",
							type: "text",
						},
					],
				},
				{
					type: "orderedList",
					attrs: {
						order: 1,
					},
					content: [
						{
							type: "listItem",
							content: [
								{
									type: "paragraph",
									content: [
										{
											text: "sdfsdf",
											type: "text",
										},
									],
								},
							],
						},
					],
				},
			],
		},
		{
			type: "paragraph",
		},
		{
			type: "paragraph",
			content: [
				{
					type: "emoji",
					attrs: {
						id: "1f92f",
						text: "🤯",
						shortName: ":exploding_head:",
					},
				},
				{
					text: " ",
					type: "text",
				},
			],
		},
	],
	version: 1,
} satisfies JSONDocNode;

test("ADF To Markdown Test", async () => {
	const result = renderADFDoc(ADFToMDTest);
	expect(result).toMatchSnapshot();
});
