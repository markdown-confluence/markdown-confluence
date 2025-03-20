/**
 * MermaidManager
 * 
 * Manages Mermaid rendering configuration for the Obsidian Confluence plugin.
 * Handles theme settings and CSS collection for rendering.
 */

import { Mermaid } from "mermaid";
import { App, loadMermaid } from "obsidian";
import { SettingsManager } from "../settings/SettingsManager";
import { ErrorHandler, ErrorLevel } from "../utils/ErrorHandler";
import { LoggerManager } from "../utils/LoggerManager";

interface MermaidRenderingConfig {
	extraStyleSheets: string[];
	extraStyles: string[];
	mermaidConfig: Record<string, unknown>;
	bodyStyles: string;
}

export class MermaidManager {
	private static instance: MermaidManager;
	private logger = LoggerManager.getInstance().getComponentLogger('MermaidManager');
	private errorHandler = ErrorHandler.getInstance();
	private settingsManager = SettingsManager.getInstance();
	private app: App | null = null;

	/**
	 * Private constructor for singleton pattern
	 */
	private constructor() { }

	/**
	 * Get the singleton instance of MermaidManager
	 */
	public static getInstance(): MermaidManager {
		if (!MermaidManager.instance) {
			MermaidManager.instance = new MermaidManager();
		}
		return MermaidManager.instance;
	}

	/**
	 * Initialize the MermaidManager with an Obsidian App instance
	 * @param app The Obsidian App instance
	 */
	public initialize(app: App): void {
		this.app = app;
	}

	/**
	 * Get Mermaid rendering configuration based on current settings
	 * @returns Mermaid rendering configuration
	 */
	public async getMermaidRenderingConfig(): Promise<MermaidRenderingConfig> {
		if (!this.app) {
			throw new Error('MermaidManager is not initialized with an App instance');
		}

		try {
			this.logger.debug('Getting Mermaid configuration');
			const settings = this.settingsManager.getSettings();
			const extraStyles: string[] = [];
			const extraStyleSheets: string[] = [];
			let bodyStyles = "";
			const body = document.querySelector("body") as HTMLBodyElement;

			switch (settings.mermaidTheme) {
				case "default":
				case "neutral":
				case "dark":
				case "forest":
					return {
						extraStyleSheets,
						extraStyles,
						mermaidConfig: { theme: settings.mermaidTheme },
						bodyStyles,
					};
				case "match-obsidian":
					bodyStyles = body.className;
					break;
				case "dark-obsidian":
					bodyStyles = "theme-dark";
					break;
				case "light-obsidian":
					bodyStyles = "theme-light";
					break;
				default:
					throw new Error("Missing or invalid theme");
			}

			extraStyleSheets.push("app://obsidian.md/app.css");

			// Get custom CSS theme if it exists
			// @ts-expect-error - Private API
			const cssTheme = this.app.vault?.getConfig("cssTheme") as string;
			if (cssTheme) {
				const fileExists = await this.app.vault.adapter.exists(
					`.obsidian/themes/${cssTheme}/theme.css`,
				);
				if (fileExists) {
					const themeCss = await this.app.vault.adapter.read(
						`.obsidian/themes/${cssTheme}/theme.css`,
					);
					extraStyles.push(themeCss);
				}
			}

			// Get CSS snippets
			// @ts-expect-error - Private API
			const cssSnippets = (this.app.vault?.getConfig("enabledCssSnippets") as string[]) ?? [];
			for (const snippet of cssSnippets) {
				const fileExists = await this.app.vault.adapter.exists(
					`.obsidian/snippets/${snippet}.css`,
				);
				if (fileExists) {
					const themeCss = await this.app.vault.adapter.read(
						`.obsidian/snippets/${snippet}.css`,
					);
					extraStyles.push(themeCss);
				}
			}

			// Get Mermaid config from loaded Mermaid instance
			const mermaidConfig = (
				(await loadMermaid()) as Mermaid
			).mermaidAPI.getConfig();

			this.logger.debug('Mermaid configuration retrieved successfully', {
				theme: settings.mermaidTheme,
				stylesheetCount: extraStyleSheets.length,
				styleCount: extraStyles.length,
				bodyStyles: bodyStyles.length > 100 ? `${bodyStyles.slice(0, 100)}...` : bodyStyles
			});

			return {
				extraStyleSheets,
				extraStyles,
				mermaidConfig: mermaidConfig as Record<string, unknown>,
				bodyStyles,
			};
		} catch (error) {
			this.errorHandler.handleError({
				message: 'Failed to get Mermaid configuration',
				error,
				component: 'MermaidManager',
				level: ErrorLevel.ERROR
			});

			// Return a basic configuration if we hit an error
			return {
				extraStyleSheets: [],
				extraStyles: [],
				mermaidConfig: { theme: 'default' },
				bodyStyles: '',
			};
		}
	}

	/**
	 * Reset the singleton instance (useful for testing)
	 */
	public static reset(): void {
		MermaidManager.instance = undefined as unknown as MermaidManager;
	}
} 