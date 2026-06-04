import { ImageUploaderPlugin } from "./ImageUploaderPlugin";
import {
	createPublisherFunctions,
	executeADFProcessingPipeline,
	executeADFProcessingPipelineEffect,
	type ADFProcessingPlugin,
	type PublisherFunctions,
} from "./types";
import {
	getMermaidFileName,
	type ChartData,
	type MermaidRenderer,
	MermaidRendererPlugin,
} from "./MermaidRendererPlugin";
import {
	getPlantumlFileName,
	type PlantumlRenderer,
	PlantumlRendererPlugin,
} from "./PlantumlRendererPlugin";

export const AlwaysADFProcessingPlugins = [ImageUploaderPlugin];

export {
	createPublisherFunctions,
	executeADFProcessingPipeline,
	executeADFProcessingPipelineEffect,
	getMermaidFileName,
	getPlantumlFileName,
	MermaidRendererPlugin,
	PlantumlRendererPlugin,
	type ADFProcessingPlugin,
	type ChartData,
	type MermaidRenderer,
	type PlantumlRenderer,
	type PublisherFunctions,
};
