/**
 * EventCoordinator
 * 
 * Centralized event management for the Obsidian Confluence plugin.
 * Provides a pub/sub system for components to communicate with each other.
 */

import { ErrorHandler, ErrorLevel } from "../utils/ErrorHandler";
import { LoggerManager } from "../utils/LoggerManager";

export type EventCallback = (...args: unknown[]) => void;

export interface EventSubscription {
	/** Event name that this subscription is for */
	event: string;
	/** Callback function to be invoked when the event occurs */
	callback: EventCallback;
	/** Optional context identifier to group related subscriptions */
	context?: string;
}

export enum PluginEvents {
	INITIALIZED = 'plugin-initialized',
	SETTINGS_CHANGED = 'settings-changed',
	MAPPINGS_CHANGED = 'mappings-changed',
	ACTIVE_MAPPING_CHANGED = 'active-mapping-changed',
	STATE_CHANGED = 'state-changed',
	PUBLISH_STARTED = 'publish-started',
	PUBLISH_COMPLETED = 'publish-completed',
	PUBLISH_FAILED = 'publish-failed',
	UI_UPDATED = 'ui-updated',
	FILE_INDICATORS_UPDATED = 'file-indicators-updated'
}

export class EventCoordinator {
	private static instance: EventCoordinator;
	private subscriptions: Map<string, EventSubscription[]> = new Map();
	private logger = LoggerManager.getInstance().getComponentLogger('EventCoordinator');
	private errorHandler = ErrorHandler.getInstance();
	private eventHistory: Map<string, { timestamp: number, args: unknown[] }[]> = new Map();
	private historyLimit = 10;

	/**
	 * Private constructor for singleton pattern
	 */
	private constructor() { }

	/**
	 * Get the singleton instance of EventCoordinator
	 */
	public static getInstance(): EventCoordinator {
		if (!EventCoordinator.instance) {
			EventCoordinator.instance = new EventCoordinator();
		}
		return EventCoordinator.instance;
	}

	/**
	 * Subscribe to an event
	 * 
	 * @param event Event name to subscribe to
	 * @param callback Function to call when the event occurs
	 * @param context Optional context identifier to group related subscriptions
	 * @returns Subscription object that can be used to unsubscribe
	 */
	public subscribe(event: string, callback: EventCallback, context?: string): EventSubscription {
		const subscription = {
			event,
			callback,
			...(context !== undefined ? { context } : {})
		} as EventSubscription;

		if (!this.subscriptions.has(event)) {
			this.subscriptions.set(event, []);
		}

		this.subscriptions.get(event)?.push(subscription);
		this.logger.debug(`Subscribed to event: ${event}${context ? ` (context: ${context})` : ''}`);

		return subscription;
	}

	/**
	 * Unsubscribe from an event
	 * 
	 * @param subscription The subscription object returned from subscribe()
	 */
	public unsubscribe(subscription: EventSubscription): void {
		const { event, callback } = subscription;

		if (!this.subscriptions.has(event)) {
			return;
		}

		const subs = this.subscriptions.get(event);
		if (!subs) return;

		const index = subs.findIndex(s => s.callback === callback);
		if (index !== -1) {
			subs.splice(index, 1);
			this.logger.debug(`Unsubscribed from event: ${event}`);
		}

		if (subs.length === 0) {
			this.subscriptions.delete(event);
		}
	}

	/**
	 * Unsubscribe all callbacks for a specific context
	 * 
	 * @param context The context identifier to unsubscribe
	 */
	public unsubscribeContext(context: string): void {
		this.logger.debug(`Unsubscribing all events for context: ${context}`);
		let count = 0;

		for (const [event, subs] of this.subscriptions.entries()) {
			const remainingSubs = subs.filter(s => s.context !== context);

			if (remainingSubs.length !== subs.length) {
				count += subs.length - remainingSubs.length;

				if (remainingSubs.length === 0) {
					this.subscriptions.delete(event);
				} else {
					this.subscriptions.set(event, remainingSubs);
				}
			}
		}

		this.logger.debug(`Unsubscribed ${count} event handlers for context: ${context}`);
	}

	/**
	 * Publish an event
	 * 
	 * @param event Event name to publish
	 * @param args Arguments to pass to the event callbacks
	 */
	public publish(event: string, ...args: unknown[]): void {
		// Record in event history
		this.recordEvent(event, args);

		if (!this.subscriptions.has(event)) {
			this.logger.debug(`Published event with no subscribers: ${event}`);
			return;
		}

		this.logger.debug(`Publishing event: ${event} with ${this.subscriptions.get(event)?.length || 0} subscribers`);
		const subs = this.subscriptions.get(event);
		if (!subs) return;

		// Execute each callback
		for (const sub of subs) {
			try {
				sub.callback(...args);
			} catch (error) {
				this.errorHandler.handleError({
					message: `Error in event handler for ${event}`,
					error,
					component: 'EventCoordinator',
					level: ErrorLevel.ERROR,
					showNotice: false
				});
			}
		}
	}

	/**
	 * Record event in history
	 * 
	 * @param event Event name
	 * @param args Event arguments
	 */
	private recordEvent(event: string, args: unknown[]): void {
		if (!this.eventHistory.has(event)) {
			this.eventHistory.set(event, []);
		}

		const eventEntries = this.eventHistory.get(event);
		if (eventEntries) {
			// Add the new event entry
			eventEntries.push({
				timestamp: Date.now(),
				args
			});

			// Trim to history limit
			if (eventEntries.length > this.historyLimit) {
				eventEntries.shift();
			}
		}
	}

	/**
	 * Get event history for a specific event
	 * 
	 * @param event Event name to get history for
	 * @returns Array of event entries with timestamp and arguments
	 */
	public getEventHistory(event: string): { timestamp: number, args: unknown[] }[] {
		return this.eventHistory.get(event) || [];
	}

	/**
	 * Get the last occurrence of an event
	 * 
	 * @param event Event name to get the last occurrence for
	 * @returns The last event entry, or null if none exists
	 */
	public getLastEvent(event: string): { timestamp: number, args: unknown[] } | null {
		const history = this.eventHistory.get(event);
		if (!history || history.length === 0) {
			return null;
		}
		// Use the non-null assertion operator since we know history is non-empty
		const lastEvent = history[history.length - 1];
		return lastEvent || null;
	}

	/**
	 * Check if an event has subscribers
	 * 
	 * @param event Event name to check
	 * @returns Whether the event has subscribers
	 */
	public hasSubscribers(event: string): boolean {
		return this.subscriptions.has(event) && (this.subscriptions.get(event)?.length ?? 0) > 0;
	}

	/**
	 * Set the maximum number of events to store in history
	 * 
	 * @param limit Maximum number of events per event type
	 */
	public setHistoryLimit(limit: number): void {
		this.historyLimit = limit;

		// Trim existing histories
		for (const [event, history] of this.eventHistory.entries()) {
			if (history.length > limit) {
				this.eventHistory.set(event, history.slice(-limit));
			}
		}
	}

	/**
	 * Get all events that have subscribers
	 * 
	 * @returns Array of event names
	 */
	public getActiveEvents(): string[] {
		return Array.from(this.subscriptions.keys());
	}

	/**
	 * Reset for testing purposes
	 */
	public static reset(): void {
		EventCoordinator.instance = undefined as unknown as EventCoordinator;
	}
} 