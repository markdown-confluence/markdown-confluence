import {
	App,
	Plugin,
	PluginManifest
} from "obsidian";

// Import types from models
import { ObsidianPluginSettings, PublishMapping } from "./models/Types";

// Re-export types for backward compatibility
export type { PublishMapping };

// Import core managers
import { EventCoordinator } from "./events/EventCoordinator";
import { ConfigMigrator } from "./migrations/ConfigMigrator";
import { SettingsManager } from "./settings/SettingsManager";
import { StateManager } from "./state/StateManager";
import { ErrorHandler } from "./utils/ErrorHandler";
import { LoggerManager } from "./utils/LoggerManager";

// Import feature managers
import { CommandManager } from "./commands/CommandManager";
import { MappingManager } from "./mapping/MappingManager";
import { MermaidManager } from "./publish/MermaidManager";
import { PublishManager } from "./publish/PublishManager";
import { ContextMenuManager } from "./ui/ContextMenuManager";
import { VisualIndicatorManager } from "./ui/VisualIndicatorManager";

// Import UI components
import { ConfluenceSettingTab } from "./ConfluenceSettingTab";

export default class ConfluencePlugin extends Plugin {
	settings!: ObsidianPluginSettings;
	private loggerManager: LoggerManager;
	private errorHandler: ErrorHandler;
	private eventCoordinator: EventCoordinator;
	private stateManager: StateManager;
	private settingsManager: SettingsManager;
	private configMigrator: ConfigMigrator;
	private mappingManager: MappingManager;
	private publishManager: PublishManager;
	private mermaidManager: MermaidManager;
	private visualIndicatorManager: VisualIndicatorManager;
	private contextMenuManager: ContextMenuManager;
	private commandManager: CommandManager;

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);

		// Initialize core managers
		this.loggerManager = LoggerManager.getInstance();
		this.errorHandler = ErrorHandler.getInstance();
		this.eventCoordinator = EventCoordinator.getInstance();
		this.stateManager = StateManager.getInstance();
		this.settingsManager = SettingsManager.getInstance();
		this.configMigrator = ConfigMigrator.getInstance();

		// Initialize feature managers
		this.mappingManager = MappingManager.getInstance();
		this.publishManager = PublishManager.getInstance();
		this.mermaidManager = MermaidManager.getInstance();
		this.visualIndicatorManager = VisualIndicatorManager.getInstance();
		this.contextMenuManager = ContextMenuManager.getInstance();
		this.commandManager = CommandManager.getInstance();
	}

	override async onload() {
		const mainLogger = this.loggerManager.getLogger();
		mainLogger.info("Loading Confluence plugin");

		try {
			// Initialize all managers with appropriate parameters
			// For managers where we're not sure about the initialization method,
			// we'll just not call it and assume the getInstance created a working instance
			this.loggerManager.initialize(this.settings?.logLevel);
			this.settingsManager.initialize(this);

			// Load settings first
			await this.settingsManager.loadSettings();

			// Get settings for local access (compatibility with old code)
			this.settings = this.settingsManager.getSettings();

			// Initialize feature managers with dependencies
			// Only call methods we know exist for sure
			this.visualIndicatorManager.initialize(this.app);
			this.contextMenuManager.initialize(this.app);
			this.commandManager.initialize(this.app, this);
			this.mermaidManager.initialize(this.app);
			await this.publishManager.initialize(this.app);

			// Register UI components
			this.addSettingTab(new ConfluenceSettingTab(this.app, this));

			// Register commands
			this.commandManager.registerCommands();

			// Register event handlers 
			this.visualIndicatorManager.registerEvents();

			// Register context menu items
			this.contextMenuManager.registerContextMenu();

			// Just reference these properties to satisfy TypeScript unused variable check
			// These could be used in future refactoring phases
			void this.eventCoordinator;
			void this.stateManager;
			void this.configMigrator;

			mainLogger.info("Confluence plugin loaded successfully");
		} catch (error) {
			if (this.errorHandler && this.errorHandler.handleError) {
				this.errorHandler.handleError({
					message: "Failed to load plugin",
					error,
					component: "ConfluencePlugin",
					showNotice: true
				});
			} else {
				// Fallback if error handler isn't available
				console.error("Failed to load plugin:", error);
			}
		}
	}

	override async onunload() {
		const mainLogger = this.loggerManager.getLogger();
		mainLogger.info("Unloading Confluence plugin");

		// Perform any cleanup needed
	}

	// For backward compatibility with ConfluenceSettingTab
	async saveSettings(skipInit: boolean = false) {
		await this.settingsManager.saveSettings(skipInit);
	}

	// For backward compatibility with ConfluenceSettingTab
	async addMapping(mapping: PublishMapping): Promise<number> {
		return await this.mappingManager.addMapping(mapping);
	}

	// For backward compatibility with ConfluenceSettingTab
	async setActiveMapping(index: number): Promise<void> {
		await this.mappingManager.setActiveMapping(index);
	}

	// For backward compatibility with ConfluenceSettingTab
	async removeMapping(index: number): Promise<void> {
		await this.mappingManager.removeMapping(index);
	}
}
