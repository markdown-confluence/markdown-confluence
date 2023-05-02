import mermaid from "mermaid";

window.renderMermaidChart = async (chartData, mermaidConfig) => {
	const {themeVariables, ...rest} = mermaidConfig;
	
	mermaid.initialize({ ...rest, startOnLoad: false });
	mermaid.mermaidAPI.updateSiteConfig({themeVariables});

	const { svg } = await mermaid.render("graphDiv2", chartData);
	const chartElement = document.querySelector("#graphDiv");
	chartElement.innerHTML = svg;

	const svgElement = document.querySelector("#graphDiv svg");
	return {
		width: svgElement.scrollWidth,
		height: svgElement.scrollHeight,
	};
};
