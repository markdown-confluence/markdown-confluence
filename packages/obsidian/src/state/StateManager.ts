/**
 * StateManager
 * 
 * Manages state across the Obsidian Confluence plugin.
 * Centralizes state changes and notifications.
 */

import { EventCoordinator } from "../events/EventCoordinator";
import { ErrorHandler, ErrorLevel } from "../utils/ErrorHandler";
import { LoggerManager } from "../utils/LoggerManager";

export enum StateChangeEvent {
	SYNCING_CHANGED = 'syncing-changed',
	ACTIVE_MAPPING_CHANGED = 'active-mapping-changed',
	// Add more state change events here as needed
}

export class StateManager {
	private static instance: StateManager;
	private logger = LoggerManager.getInstance().getComponentLogger('StateManager');
	private errorHandler = ErrorHandler.getInstance();
	private eventCoordinator = EventCoordinator.getInstance();

	// State variables
	private isSyncing = false;

	/**
	 * Private constructor for singleton pattern
	 */
	private constructor() { }

	/**
	 * Get the singleton instance of StateManager
	 */
	public static getInstance(): StateManager {
		if (!StateManager.instance) {
			StateManager.instance = new StateManager();
		}
		return StateManager.instance;
	}

	/**
	 * Get the current syncing state
	 */
	public getSyncingState(): boolean {
		return this.isSyncing;
	}

	/**
	 * Set the syncing state
	 * @param value The new syncing state
	 */
	public setSyncingState(value: boolean): void {
		if (this.isSyncing !== value) {
			this.isSyncing = value;
			this.logger.debug(`Syncing state changed to: ${value}`);

			// Notify subscribers about the state change
			this.eventCoordinator.publish(StateChangeEvent.SYNCING_CHANGED, value);
		}
	}

	/**
	 * Safely execute an async function that changes syncing state
	 * @param fn The async function to execute
	 * @returns The result of the function
	 */
	public async withSyncingState<T>(fn: () => Promise<T>): Promise<T> {
		if (this.isSyncing) {
			this.logger.warn('Attempted to start syncing while already in progress');
			throw new Error('Sync already in progress');
		}

		this.setSyncingState(true);

		try {
			const result = await fn();
			return result;
		} catch (error) {
			this.errorHandler.handleError({
				message: 'Error during sync operation',
				error,
				component: 'StateManager',
				level: ErrorLevel.ERROR
			});
			throw error;
		} finally {
			this.setSyncingState(false);
		}
	}

	/**
	 * Subscribe to state changes
	 * @param event The state change event to subscribe to
	 * @param callback The callback to invoke when the state changes
	 * @param context Optional context identifier
	 * @returns The event subscription
	 */
	public subscribeToStateChanges(
		event: StateChangeEvent,
		callback: (...args: unknown[]) => void,
		context?: string
	) {
		return this.eventCoordinator.subscribe(event, callback, context);
	}

	/**
	 * Reset the singleton instance (useful for testing)
	 */
	public static reset(): void {
		StateManager.instance = undefined as unknown as StateManager;
	}
} 