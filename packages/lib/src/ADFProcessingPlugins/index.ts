import { ImageUploaderPlugin } from "./ImageUploaderPlugin";
import {
	createPublisherFunctions,
	executeADFProcessingPipeline,
	type ADFProcessingPlugin,
	type PublisherFunctions,
} from "./types";
import {
	getMermaidFileName,
	type ChartData,
	type MermaidRenderer,
	MermaidRendererPlugin,
} from "./MermaidRendererPlugin";

export const AlwaysADFProcessingPlugins = [ImageUploaderPlugin];

export {
	createPublisherFunctions,
	executeADFProcessingPipeline,
	getMermaidFileName,
	MermaidRendererPlugin,
	type ADFProcessingPlugin,
	type ChartData,
	type MermaidRenderer,
	type PublisherFunctions,
};
