/**
 * EventCoordinator
 * 
 * Centralized event management for the Obsidian Confluence plugin.
 * Provides a pub/sub system for components to communicate with each other.
 */

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

export class EventCoordinator {
	private static instance: EventCoordinator;
	private subscriptions: Map<string, EventSubscription[]> = new Map();
	private logger = LoggerManager.getInstance().getComponentLogger('EventCoordinator');

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

		for (const [event, subs] of this.subscriptions.entries()) {
			const remainingSubs = subs.filter(s => s.context !== context);

			if (remainingSubs.length !== subs.length) {
				if (remainingSubs.length === 0) {
					this.subscriptions.delete(event);
				} else {
					this.subscriptions.set(event, remainingSubs);
				}
			}
		}
	}

	/**
	 * Publish an event
	 * 
	 * @param event Event name to publish
	 * @param args Arguments to pass to the event callbacks
	 */
	public publish(event: string, ...args: unknown[]): void {
		if (!this.subscriptions.has(event)) {
			this.logger.debug(`Published event with no subscribers: ${event}`);
			return;
		}

		this.logger.debug(`Publishing event: ${event}`);
		const subs = this.subscriptions.get(event);
		if (!subs) return;

		// Execute each callback
		for (const sub of subs) {
			try {
				sub.callback(...args);
			} catch (error) {
				this.logger.error(`Error in event handler for ${event}:`, error);
			}
		}
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
	 * Reset for testing purposes
	 */
	public static reset(): void {
		EventCoordinator.instance = undefined as unknown as EventCoordinator;
	}
} 