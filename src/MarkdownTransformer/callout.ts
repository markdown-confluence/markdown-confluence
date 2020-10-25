import type MarkdownIt from "markdown-it/lib";
import type StateCore from "markdown-it/lib/rules_core/state_core";

const panelRegex = /\[!(?<calloutType>.*)]/;

//panelType Options: "info", "note", "warning", "success", "error", "custom"
const panelTypeToAttributesMap = {
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

function getPanelAttributes(calloutType: string) {
	const calloutTypeCheck = calloutType.toLowerCase();
	if (Object.keys(panelTypeToAttributesMap).includes(calloutTypeCheck)) {
		return panelTypeToAttributesMap[calloutTypeCheck];
	}

	return panelTypeToAttributesMap["info"];
}

export default function example_plugin(md: MarkdownIt): void {
	md.core.ruler.push("panel", panel);
}

function capitalizeFirstLetter(string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
}

export function panel(state: StateCore): boolean {
	let isInCallout = false;
	let calloutStartIndex = 0;
	const newTokens = state.tokens.reduce(
		(previousTokens, token, currentIndex: number, allTokens) => {
			let tokenToReturn = token;
			if (token.type === "blockquote_open") {
				let currentCheck = currentIndex + 1; // Start after this token
				while (true) {
					const tokenToCheck = allTokens[currentCheck];
					currentCheck = currentCheck + 1;
					if (tokenToCheck.type === "blockquote_close") {
						break;
					}
					if (tokenToCheck.content === "") {
						continue;
					}

					const check = tokenToCheck.content.match(panelRegex);

					if (check === null) {
						continue;
					}

					const calloutType = check.groups["calloutType"];
					calloutStartIndex = currentCheck - 1;
					isInCallout = true;
					tokenToReturn = new state.Token("panel_open", "", 0);
					tokenToReturn.markup = ">";
					tokenToReturn.block = true;
					tokenToReturn.nesting = 1;
					tokenToReturn.attrs = getPanelAttributes(calloutType);
					break;
				}
			}
			if (token.type === "blockquote_close" && isInCallout) {
				token.type = "panel_close";
				token.tag = "";
			}
			if (currentIndex === calloutStartIndex && isInCallout) {
				const check = token.content.match(panelRegex);
				const calloutTitle = capitalizeFirstLetter(
					check.groups["calloutType"]
				);
				token.content = token.content.replace(check[0], calloutTitle);
				for (let i = 0; i < token.children.length; i++) {
					const child = token.children[i];
					if (child.content.includes(check[0])) {
						child.content = child.content.replace(
							check[0],
							calloutTitle
						);
						break;
					}
				}
			}

			return [...previousTokens, tokenToReturn];
		},
		[]
	);

	state.tokens = newTokens;
	return true;
}
