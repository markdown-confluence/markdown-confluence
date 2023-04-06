declare module "showdown-confluence";
declare module "md-to-adf-dailykos/source/index";

declare module "*.txt" {
	const content: any;
	export default content;
}

declare module "*.json" {
	const content: any;
	export default content;
}

declare module "mermaid_renderer.esbuild" {
	const content: Buffer;
	export default content;
}
