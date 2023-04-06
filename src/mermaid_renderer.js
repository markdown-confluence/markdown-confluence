import mermaid from "mermaid";

window.renderMermaidChart = async (chartData, mermaidConfig) => {
	mermaid.initialize({ ...mermaidConfig, startOnLoad: false });

	return new Promise(async (resolve) => {
		const { svg } = await mermaid.render("graphDiv2", chartData);
		const chartElement = document.querySelector("#graphDiv");
		chartElement.innerHTML = svg;

		const svgElement = document.querySelector("#graphDiv svg");
		resolve({
			x: 0,
			y: 0,
			width: svgElement.scrollWidth,
			height: svgElement.scrollHeight,
		});
	});
};
