/**
 * ErrorHandler
 * 
 * Standardized error handling for the Obsidian Confluence plugin.
 * Provides consistent error reporting and user-friendly displays.
 */

import { Notice } from "obsidian";
import { Logger } from "./Logger";
import { LoggerManager } from "./LoggerManager";

export enum ErrorLevel {
	INFO = "info",
	WARNING = "warning",
	ERROR = "error",
	CRITICAL = "critical"
}

export interface ErrorDetails {
	/** Short, human-readable error message */
	message: string;
	/** Detailed explanation for troubleshooting */
	details?: string;
	/** Associated error object if available */
	error?: Error | unknown;
	/** Component where the error occurred */
	component?: string;
	/** Error severity level */
	level?: ErrorLevel;
	/** Whether to display a notice to the user */
	showNotice?: boolean;
}

// Interface for API error objects
interface ApiErrorResponse {
	response?: {
		data?: string | Record<string, unknown>;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

export class ErrorHandler {
	private static instance: ErrorHandler;
	private logger: Logger;

	/**
	 * Private constructor for singleton pattern
	 */
	private constructor() {
		this.logger = LoggerManager.getInstance().getComponentLogger('ErrorHandler');
	}

	/**
	 * Get the singleton instance of ErrorHandler
	 */
	public static getInstance(): ErrorHandler {
		if (!ErrorHandler.instance) {
			ErrorHandler.instance = new ErrorHandler();
		}
		return ErrorHandler.instance;
	}

	/**
	 * Handle an error with standardized logging and optional user notification
	 */
	public handleError(details: ErrorDetails): void {
		const {
			message,
			details: errorDetails,
			error,
			component = 'unknown',
			level = ErrorLevel.ERROR,
			showNotice = true
		} = details;

		// Determine which logging method to use based on error level
		switch (level) {
			case ErrorLevel.INFO:
				this.logger.info(`[${component}] ${message}`, { errorDetails, error });
				break;
			case ErrorLevel.WARNING:
				this.logger.warn(`[${component}] ${message}`, { errorDetails, error });
				break;
			case ErrorLevel.ERROR:
				this.logger.error(`[${component}] ${message}`, { errorDetails, error });
				break;
			case ErrorLevel.CRITICAL:
				this.logger.error(`[CRITICAL] [${component}] ${message}`, { errorDetails, error });
				break;
		}

		// Show notification to the user if requested
		if (showNotice) {
			new Notice(`Confluence Plugin: ${message}`);
		}
	}

	/**
	 * Format an error into a user-friendly message string
	 */
	public formatError(error: unknown): string {
		if (error instanceof Error) {
			return error.message;
		}

		if (typeof error === 'string') {
			return error;
		}

		try {
			return JSON.stringify(error);
		} catch {
			return 'An unknown error occurred';
		}
	}

	/**
	 * Extract error details from Confluence API errors
	 */
	public extractApiErrorDetails(error: unknown): string {
		if (error && typeof error === 'object') {
			const apiError = error as ApiErrorResponse;
			if ('response' in apiError && apiError.response) {
				const response = apiError.response;
				if ('data' in response) {
					return typeof response.data === 'string'
						? response.data
						: JSON.stringify(response.data);
				}
			}
		}
		return this.formatError(error);
	}

	/**
	 * Clean up resources (for testing purposes)
	 */
	public static reset(): void {
		ErrorHandler.instance = undefined as unknown as ErrorHandler;
	}
} 