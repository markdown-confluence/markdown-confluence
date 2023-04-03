export interface ChartData {
	name: string;
	data: string;
}

export interface MermaidRenderer {
	captureMermaidCharts(charts: ChartData[]): Promise<Map<string, Buffer>>;
}
