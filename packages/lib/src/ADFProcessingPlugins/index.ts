import { ImageUploaderPlugin } from "./ImageUploaderPlugin";
import {
	createPublisherFunctions,
	executeADFPreprocessorsEffect,
	executeADFProcessingPipeline,
	executeADFProcessingPipelineEffect,
	type ADFPreprocessor,
	type ADFPreprocessorContext,
	type ADFProcessingPlugin,
	type PublisherFunctions,
} from "./types";
import { PlantumlEmbedResolverPlugin } from "./PlantumlEmbedResolverPlugin";
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

// Preprocessors run before the main pipeline; they can do async I/O
// (e.g. read referenced files) before extract() begins.
export const AlwaysADFPreprocessors: ADFPreprocessor[] = [PlantumlEmbedResolverPlugin];

export {
	createPublisherFunctions,
	executeADFPreprocessorsEffect,
	executeADFProcessingPipeline,
	executeADFProcessingPipelineEffect,
	getMermaidFileName,
	getPlantumlFileName,
	MermaidRendererPlugin,
	PlantumlEmbedResolverPlugin,
	PlantumlRendererPlugin,
	type ADFPreprocessor,
	type ADFPreprocessorContext,
	type ADFProcessingPlugin,
	type ChartData,
	type MermaidRenderer,
	type PlantumlRenderer,
	type PublisherFunctions,
};
