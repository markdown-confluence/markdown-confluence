import * as ConfluencePageConfig from "./ConniePageConfig";
import { createAuthenticatedConfluenceClient } from "./AuthenticatedConfluenceClient";
import * as ConfluenceUploadSettings from "./Settings";
import {
	AlwaysADFProcessingPlugins,
	createPublisherFunctions,
	executeADFProcessingPipeline,
	executeADFProcessingPipelineEffect,
	getMermaidFileName,
	MermaidRendererPlugin,
	type ADFProcessingPlugin,
	type ChartData,
	type MermaidRenderer,
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
	loadConfluenceSettings,
	loadConfluenceSettingsEffect,
	makeConfluenceSettingsConfigProvider,
	parseConfluenceSettingsEffect,
} from "./SettingsConfig";

export {
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
	Publisher,
	RuntimeEnvironmentLive,
	RuntimeEnvironmentService,
	confluenceSettingsConfig,
	convertMDtoADF,
	createConfluenceClientConfig,
	createAuthenticatedConfluenceClient,
	createPublisherFunctions,
	executeADFProcessingPipeline,
	executeADFProcessingPipelineEffect,
	fetchOAuthAccessToken,
	getMermaidFileName,
	loadConfluenceSettings,
	loadConfluenceSettingsEffect,
	loadMarkdownWorkspace,
	makeConfluenceSettingsConfigProvider,
	makeMarkdownWorkspaceEffect,
	normalizeConfluenceApiPrefix,
	parseConfluenceSettingsEffect,
	parseMarkdownToADF,
	renderADFDoc,
	runEffect,
	shouldPublishMarkdownFile,
	stripMarkdownHtmlComments,
	validateConfluenceSettings,
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
	type PublisherFunctions,
	type RequiredConfluenceClient,
	type RuntimeEnvironment,
	type UploadAdfFileResult,
};
