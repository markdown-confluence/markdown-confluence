/**
 * LoggerManager
 * 
 * Centralized logging configuration and management for the Obsidian Confluence plugin.
 * This manager provides a single point of access to logger instances across the plugin.
 */

import { Logger, LoggerOptions, LogLevel } from './Logger';

export class LoggerManager {
	private static instance: LoggerManager;
	private mainLogger: Logger;
	private loggers: Map<string, Logger> = new Map();

	/**
	 * Private constructor for singleton pattern
	 */
	private constructor() {
		this.mainLogger = Logger.createDefault();
		this.loggers.set('main', this.mainLogger);
	}

	/**
	 * Get the singleton instance of LoggerManager
	 */
	public static getInstance(): LoggerManager {
		if (!LoggerManager.instance) {
			LoggerManager.instance = new LoggerManager();
		}
		return LoggerManager.instance;
	}

	/**
	 * Initialize the LoggerManager with plugin settings
	 * @param logLevel The minimum log level to display
	 */
	public initialize(logLevel: LogLevel): void {
		this.mainLogger.updateOptions({ minLevel: logLevel });

		// Update all existing loggers with the new log level
		this.loggers.forEach(logger => {
			logger.updateOptions({ minLevel: logLevel });
		});
	}

	/**
	 * Get the main logger instance
	 */
	public getLogger(): Logger {
		return this.mainLogger;
	}

	/**
	 * Get or create a component-specific logger
	 * @param component The component name to create a logger for
	 * @param options Optional logger configuration options
	 */
	public getComponentLogger(component: string, options?: Partial<LoggerOptions>): Logger {
		// Return existing logger if it exists
		if (this.loggers.has(component)) {
			const logger = this.loggers.get(component);

			// Update options if provided
			if (options && logger) {
				logger.updateOptions(options);
			}

			return logger as Logger;
		}

		// Create new component logger
		const componentLogger = this.mainLogger.createChildLogger(component, options);
		this.loggers.set(component, componentLogger);
		return componentLogger;
	}

	/**
	 * Update the log level for all loggers
	 * @param level The new minimum log level
	 */
	public setLogLevel(level: LogLevel): void {
		this.loggers.forEach(logger => {
			logger.updateOptions({ minLevel: level });
		});
	}

	/**
	 * Clean up resources (for testing purposes)
	 */
	public static reset(): void {
		LoggerManager.instance = undefined as unknown as LoggerManager;
	}
} 