import SparkMD5 from "spark-md5";

export function getMermaidFileName(mermaidContent: string | undefined) {
	const mermaidText = mermaidContent ?? "flowchart LR\nid1[Missing Chart]";
	const pathMd5 = SparkMD5.hash(mermaidText);
	const uploadFilename = `RenderedMermaidChart-${pathMd5}.png`;
	return { uploadFilename, mermaidText };
}

export interface ChartData {
	name: string;
	data: string;
}

export interface MermaidRenderer {
	captureMermaidCharts(charts: ChartData[]): Promise<Map<string, Buffer>>;
}
