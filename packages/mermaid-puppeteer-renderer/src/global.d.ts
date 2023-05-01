interface Window {
	renderMermaidChart: (
		mermaidData: string,
		mermaidConfig: unknown
	) => Promise<{ width: number; height: number }>;
}
