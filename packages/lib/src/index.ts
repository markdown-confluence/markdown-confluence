import { normalizeAdfForComparison } from "./AdfEqual";
import {
	MarkdownSourceTransformerService,
	type MarkdownSourceTransformer,
	type MarkdownSourceContext,
} from "./MarkdownSourceTransformer";
import type { ConfluenceFetch } from "./ConfluenceFetch";
import { transformMarkdownCodeBlocks, type MarkdownCodeBlock } from "./MarkdownCodeBlocks";
import { fetchConfluencePageAdf, resolveConfluencePageId } from "./ConfluencePage";
import { convertADFToMarkdown, type AdfToMarkdownOptions } from "./AdfConversion";
import { readAdfDocument } from "./AdfDocument";
import * as ConfluencePageConfig from "./ConniePageConfig";
import { createAuthenticatedConfluenceClient } from "./AuthenticatedConfluenceClient";
import * as ConfluenceUploadSettings from "./Settings";
import {
	AlwaysADFPreprocessors,
	AlwaysADFProcessingPlugins,
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
} from "./ADFProcessingPlugins";
import { renderADFDoc } from "./ADFToMarkdown";
import {
	createConfluenceClientConfig,
	DEFAULT_CONFLUENCE_API_PREFIX,
	normalizeConfluenceApiPrefix,
} from "./ConfluenceClientConfig";
import { type RequiredConfluenceClient } from "./ConfluenceClient";
import {
	MarkdownConfluencePlatformLive,
	MarkdownConfluenceRuntime,
	RuntimeEnvironmentLive,
	RuntimeEnvironmentService,
	StandardInputService,
	StandardInputLive,
	runEffect,
	type MarkdownConfluencePlatform,
	type RuntimeEnvironment,
} from "./effects";
import {
	MarkdownWorkspaceLive,
	MarkdownWorkspaceService,
	loadMarkdownWorkspace,
	makeMarkdownWorkspaceEffect,
	shouldPublishMarkdownFile,
	type BinaryFile,
	type FilesToUpload,
	type MarkdownFile,
	type MarkdownWorkspace,
} from "./MarkdownWorkspace";
import { convertMDtoADF, parseMarkdownToADF, stripMarkdownHtmlComments } from "./MdToADF";
import { ConfluenceV2Client, ConfluenceV2Error } from "./ConfluenceV2Client";
import {
	ATLASSIAN_OAUTH_AUDIENCE,
	ATLASSIAN_OAUTH_TOKEN_URL,
	fetchOAuthAccessToken,
} from "./OAuthToken";
import {
	Publisher,
	type ConfluenceAdfFile,
	type ConfluenceNode,
	type ConfluenceTreeNode,
	type LocalAdfFile,
	type LocalAdfFileTreeNode,
	type UploadAdfFileResult,
} from "./Publisher";
import {
	validateConfluenceSettings,
	type ConfluenceSettingsValidationIssue,
	type ConfluenceSettingsValidationResult,
} from "./Settings";
import {
	ConfluenceSettingsLive,
	confluenceSettingsConfig,
	confluenceReadSettingsConfig,
	loadConfluenceSettings,
	loadConfluenceSettingsEffect,
	makeConfluenceSettingsConfigProvider,
	parseConfluenceSettingsEffect,
	parseConfluenceCommandLineOptions,
} from "./SettingsConfig";

export {
	normalizeAdfForComparison,
	type ConfluenceFetch,
	MarkdownSourceTransformerService,
	type MarkdownSourceTransformer,
	type MarkdownSourceContext,
	transformMarkdownCodeBlocks,
	type MarkdownCodeBlock,
	fetchConfluencePageAdf,
	resolveConfluencePageId,
	convertADFToMarkdown,
	type AdfToMarkdownOptions,
	readAdfDocument,
	AlwaysADFPreprocessors,
	AlwaysADFProcessingPlugins,
	ATLASSIAN_OAUTH_AUDIENCE,
	ATLASSIAN_OAUTH_TOKEN_URL,
	ConfluencePageConfig,
	ConfluenceSettingsLive,
	ConfluenceUploadSettings,
	DEFAULT_CONFLUENCE_API_PREFIX,
	ConfluenceV2Client,
	ConfluenceV2Error,
	MarkdownConfluencePlatformLive,
	MarkdownConfluenceRuntime,
	MarkdownWorkspaceLive,
	MarkdownWorkspaceService,
	MermaidRendererPlugin,
	PlantumlEmbedResolverPlugin,
	PlantumlRendererPlugin,
	Publisher,
	RuntimeEnvironmentLive,
	RuntimeEnvironmentService,
	StandardInputService,
	StandardInputLive,
	confluenceSettingsConfig,
	confluenceReadSettingsConfig,
	convertMDtoADF,
	createConfluenceClientConfig,
	createAuthenticatedConfluenceClient,
	createPublisherFunctions,
	executeADFPreprocessorsEffect,
	executeADFProcessingPipeline,
	executeADFProcessingPipelineEffect,
	fetchOAuthAccessToken,
	getMermaidFileName,
	getPlantumlFileName,
	loadConfluenceSettings,
	loadConfluenceSettingsEffect,
	loadMarkdownWorkspace,
	makeConfluenceSettingsConfigProvider,
	makeMarkdownWorkspaceEffect,
	normalizeConfluenceApiPrefix,
	parseConfluenceSettingsEffect,
	parseMarkdownToADF,
	parseConfluenceCommandLineOptions,
	renderADFDoc,
	runEffect,
	shouldPublishMarkdownFile,
	stripMarkdownHtmlComments,
	validateConfluenceSettings,
	type ADFPreprocessor,
	type ADFPreprocessorContext,
	type ADFProcessingPlugin,
	type BinaryFile,
	type ChartData,
	type ConfluenceAdfFile,
	type ConfluenceNode,
	type ConfluenceSettingsValidationIssue,
	type ConfluenceSettingsValidationResult,
	type ConfluenceTreeNode,
	type FilesToUpload,
	type LocalAdfFile,
	type LocalAdfFileTreeNode,
	type MarkdownConfluencePlatform,
	type MarkdownFile,
	type MarkdownWorkspace,
	type MermaidRenderer,
	type PlantumlRenderer,
	type PublisherFunctions,
	type RequiredConfluenceClient,
	type RuntimeEnvironment,
	type UploadAdfFileResult,
};

import { MathRendererPlugin, readMathExpression } from "./ADFProcessingPlugins/MathRendererPlugin";
import {
	renderMathSvg,
	mathImageHtml,
	rasterizeMathImage,
	type MathExpression,
	type MathRenderer,
} from "./MathRenderer";

export {
	MathRendererPlugin,
	readMathExpression,
	renderMathSvg,
	mathImageHtml,
	rasterizeMathImage,
	type MathExpression,
	type MathRenderer,
};

import { lockPageEditing } from "./PageEditLock";
export { lockPageEditing };

import { validatePublishingFiles, planPublishingFiles, publishingReport } from "./PublishingReport";
export { validatePublishingFiles, planPublishingFiles, publishingReport };

import { validateMermaidOptions, type MermaidOptions } from "./MermaidOptions";
export { validateMermaidOptions, type MermaidOptions };

import {
	KrokiRendererPlugin,
	HttpKrokiRenderer,
	DEFAULT_KROKI_SETTINGS,
	getKrokiFileName,
	type KrokiSettings,
	type KrokiChart,
} from "./ADFProcessingPlugins/KrokiRendererPlugin";

export {
	KrokiRendererPlugin,
	HttpKrokiRenderer,
	DEFAULT_KROKI_SETTINGS,
	getKrokiFileName,
	type KrokiSettings,
	type KrokiChart,
};
