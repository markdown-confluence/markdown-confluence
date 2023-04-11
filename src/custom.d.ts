declare module "*.txt" {
	const content: string;
	export default content;
}

declare module "*.json" {
	const content: unknown;
	export default content;
}

declare module "mermaid_renderer.esbuild" {
	const content: Buffer;
	export default content;
}
