import type MarkdownIt from "markdown-it";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";

const panelRegex = /\[!(?<calloutType>.*?)\](?<collapseType>[+-])?[ \t]*(?<title>.*)/;

//panelType Options: "info", "note", "warning", "success", "error", "custom"
const panelTypeToAttributesMap: Record<string, [string, string][]> = {
	note: [["panelType", "note"]],
	abstract: [
		["panelType", "custom"],
		["panelIconId", "784a28f7-4aed-4be0-8d1c-5528271ddf8e"],
		["panelIcon", ":wow:"],
		["panelIconText", "😮"],
		["panelColor", "#FF8F73"],
	],
	info: [["panelType", "info"]],
	todo: [
		["panelType", "custom"],
		["panelIconId", "784a28f7-4aed-4be0-8d1c-5528271ddf8e"],
		["panelIcon", ":wow:"],
		["panelIconText", ":wow:"],
		["panelColor", "#FF8F73"],
	],
	tip: [
		["panelType", "custom"],
		["panelIconId", "784a28f7-4aed-4be0-8d1c-5528271ddf8e"],
		["panelIcon", ":wow:"],
		["panelIconText", ":wow:"],
		["panelColor", "#FF8F73"],
	],
	success: [["panelType", "success"]],
	question: [
		["panelType", "custom"],
		["panelIconId", "784a28f7-4aed-4be0-8d1c-5528271ddf8e"],
		["panelIcon", ":wow:"],
		["panelIconText", ":wow:"],
		["panelColor", "#FF8F73"],
	],
	warning: [["panelType", "warning"]],
	failure: [["panelType", "error"]],
	danger: [
		["panelType", "custom"],
		["panelIconId", "784a28f7-4aed-4be0-8d1c-5528271ddf8e"],
		["panelIcon", ":wow:"],
		["panelIconText", ":wow:"],
		["panelColor", "#FF8F73"],
	],
	bug: [
		["panelType", "custom"],
		["panelIconId", "784a28f7-4aed-4be0-8d1c-5528271ddf8e"],
		["panelIcon", ":wow:"],
		["panelIconText", ":wow:"],
		["panelColor", "#FF8F73"],
	],
	example: [
		["panelType", "custom"],
		["panelIconId", "784a28f7-4aed-4be0-8d1c-5528271ddf8e"],
		["panelIcon", ":wow:"],
		["panelIconText", ":wow:"],
		["panelColor", "#FF8F73"],
	],
	quote: [
		["panelType", "custom"],
		["panelIconId", "784a28f7-4aed-4be0-8d1c-5528271ddf8e"],
		["panelIcon", ":wow:"],
		["panelIconText", ":wow:"],
		["panelColor", "#FF8F73"],
	],
};

function getPanelAttributes(calloutType: string): [string, string][] {
	const calloutTypeCheck = calloutType.toLowerCase();
	const toReturn = panelTypeToAttributesMap[calloutTypeCheck];
	if (toReturn) {
		return toReturn;
	}

	// @ts-expect-error
	return panelTypeToAttributesMap["info"];
}

export default function calloutPlugin(md: MarkdownIt): void {
	md.core.ruler.push("panel", panel);
	md.core.ruler.push("expand", () => false);
}

function capitalizeFirstLetter(string: string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
}

export function panel(state: StateCore): boolean {
	const stack: string[] = [];
	const flattened = new Set<StateCore["tokens"][number]>();
	for (let index = 0; index < state.tokens.length; index++) {
		const token = state.tokens[index]!;
		if (token.type === "blockquote_open") {
			const paragraph = state.tokens[index + 1];
			const inline = state.tokens[index + 2];
			const match =
				paragraph?.type === "paragraph_open" && inline?.type === "inline"
					? inline.content.match(panelRegex)
					: null;
			if (!match?.groups || match.index !== 0 || !inline) {
				const type = stack.some((parent) => parent !== "blockquote")
					? "flattened"
					: "blockquote";
				stack.push(type);
				if (type === "flattened") flattened.add(token);
				continue;
			}
			const calloutType = match.groups["calloutType"] ?? "info";
			const collapseType = match.groups["collapseType"];
			const title = match.groups["title"] || capitalizeFirstLetter(calloutType);
			// Confluence panels cannot contain panels or blockquotes. Keep nested
			// callout content as paragraphs instead of letting the schema drop it.
			const nested = stack.some((parent) => parent !== "blockquote");
			const type = nested
				? "flattened"
				: collapseType === "+" || collapseType === "-"
					? "expand"
					: "panel";
			stack.push(type);
			if (nested) flattened.add(token);
			token.type = `${type}_open`;
			token.tag = "";
			token.attrs = type === "expand" ? [["title", title]] : getPanelAttributes(calloutType);
			inline.content = inline.content.replace(
				match[0],
				nested ? `${capitalizeFirstLetter(calloutType)}: ${title}` : title,
			);
			inline.children = [];
			state.md.inline.parse(inline.content, state.md, state.env, inline.children);
		} else if (token.type === "blockquote_close") {
			const type = stack.pop();
			if (type === "flattened") {
				flattened.add(token);
			} else if (type && type !== "blockquote") {
				token.type = `${type}_close`;
				token.tag = "";
			}
		}
	}
	state.tokens = state.tokens.filter((token) => !flattened.has(token));
	return true;
}
