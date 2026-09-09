import mermaid from "mermaid";

// SVG is also exported for use outside this document's CSP. Reject active
// resources rather than relying on the capture browser to keep them inert.
function assertSelfContainedSvg(svgElement) {
	const forbiddenElements = new Set([
		"script",
		"iframe",
		"object",
		"embed",
		"link",
		"base",
		"meta",
		"image",
		"feimage",
		"audio",
		"video",
		"source",
		"animate",
		"animatemotion",
		"animatetransform",
		"set",
		"form",
		"input",
		"button",
		"select",
		"textarea",
	]);
	const resourceAttributes = new Set([
		"src",
		"srcset",
		"base",
		"srcdoc",
		"action",
		"formaction",
		"background",
		"poster",
		"data",
		"codebase",
		"archive",
		"manifest",
		"profile",
		"longdesc",
		"ping",
	]);
	const checkCss = (css) => {
		// CSS escapes/comments can conceal URL tokens. Mermaid's generated styles
		// do not require either; external CSS resources are intentionally unsupported.
		if (/\\|\/\*|@import|(?:image-set|image|src|paint|element)\s*\(/iu.test(css)) {
			throw new Error("Mermaid resources must be self-contained: unsupported CSS");
		}
		for (const match of css.matchAll(/url\s*\(([^)]*)\)/giu)) {
			if (!/^\s*["']?#[a-zA-Z_][\w:.-]*["']?\s*$/u.test(match[1])) {
				throw new Error("Mermaid resources must be self-contained: external CSS URL");
			}
		}
	};
	for (const element of [svgElement, ...svgElement.querySelectorAll("*")]) {
		if (forbiddenElements.has(element.localName.toLowerCase())) {
			throw new Error("Mermaid resources must be self-contained: unsupported element");
		}
		if (element.localName.toLowerCase() === "style") checkCss(element.textContent ?? "");
		for (const attribute of element.attributes) {
			const name = attribute.localName.toLowerCase();
			if (name.startsWith("on") || resourceAttributes.has(name)) {
				throw new Error("Mermaid resources must be self-contained: active attribute");
			}
			if (name === "href" && !/^#[a-zA-Z_][\w:.-]*$/u.test(attribute.value)) {
				throw new Error("Mermaid resources must be self-contained: external reference");
			}
			// URL-valued presentation attributes (filter, fill, marker-end, etc.)
			// require the same checks as style declarations.
			if (name === "style" || /url\s*\(|\\/iu.test(attribute.value)) {
				checkCss(attribute.value);
			}
		}
	}
}

window.renderMermaidChart = async (chartData, mermaidConfig) => {
	mermaid.initialize({
		...mermaidConfig,
		startOnLoad: false,
		securityLevel: "strict",
		suppressErrorRendering: true,
	});

	let svg;
	try {
		({ svg } = await mermaid.render("graphDiv2", chartData));
	} catch (error) {
		if (error?.name === "EncodingError") {
			throw new Error(
				"Mermaid images and external resources are disabled; remove the diagram's image reference",
				{ cause: error },
			);
		}
		throw error;
	}
	const chartElement = document.querySelector("#graphDiv");
	chartElement.innerHTML = svg;

	const svgElement = document.querySelector("#graphDiv svg");
	assertSelfContainedSvg(svgElement);
	return {
		width: Math.max(1, Math.ceil(svgElement.getBoundingClientRect().width)),
		height: Math.max(1, Math.ceil(svgElement.getBoundingClientRect().height)),
		svg: svgElement.outerHTML,
	};
};
