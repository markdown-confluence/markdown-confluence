/**
 * DependencyContainer
 * 
 * Simple dependency injection system for the Obsidian Confluence plugin.
 * Manages component instantiation, component lifecycle, and provides testing support.
 */

import { LoggerManager } from "./LoggerManager";

/**
 * Factory function type for creating dependencies
 */
export type FactoryFunction<T> = (...args: unknown[]) => T;

/**
 * Base type for dependencies
 */
export type Dependency = unknown;

export class DependencyContainer {
	private static instance: DependencyContainer;
	private dependencies: Map<string, Dependency> = new Map();
	private factories: Map<string, FactoryFunction<unknown>> = new Map();
	private logger = LoggerManager.getInstance().getComponentLogger('DependencyContainer');

	/**
	 * Private constructor for singleton pattern
	 */
	private constructor() { }

	/**
	 * Get the singleton instance of DependencyContainer
	 */
	public static getInstance(): DependencyContainer {
		if (!DependencyContainer.instance) {
			DependencyContainer.instance = new DependencyContainer();
		}
		return DependencyContainer.instance;
	}

	/**
	 * Register a dependency instance
	 * 
	 * @param key Unique identifier for the dependency
	 * @param instance The dependency instance
	 */
	public register<T>(key: string, instance: T): void {
		this.logger.debug(`Registering dependency: ${key}`);
		this.dependencies.set(key, instance);
	}

	/**
	 * Register a factory function for lazy instantiation
	 * 
	 * @param key Unique identifier for the dependency
	 * @param factory Factory function to create the dependency when needed
	 */
	public registerFactory<T>(key: string, factory: FactoryFunction<T>): void {
		this.logger.debug(`Registering factory: ${key}`);
		this.factories.set(key, factory as FactoryFunction<unknown>);
	}

	/**
	 * Get a dependency by key, instantiating it if needed and not yet created
	 * 
	 * @param key Unique identifier for the dependency
	 * @returns The dependency instance
	 */
	public get<T>(key: string): T {
		// Return existing instance if available
		if (this.dependencies.has(key)) {
			return this.dependencies.get(key) as T;
		}

		// Create instance from factory if available
		if (this.factories.has(key)) {
			this.logger.debug(`Lazily instantiating: ${key}`);
			const factory = this.factories.get(key) as FactoryFunction<T>;
			const instance = factory();
			this.dependencies.set(key, instance);
			return instance;
		}

		this.logger.error(`Dependency not found: ${key}`);
		throw new Error(`Dependency not found: ${key}`);
	}

	/**
	 * Check if a dependency exists
	 * 
	 * @param key Unique identifier for the dependency
	 */
	public has(key: string): boolean {
		return this.dependencies.has(key) || this.factories.has(key);
	}

	/**
	 * Remove a dependency
	 * 
	 * @param key Unique identifier for the dependency
	 */
	public remove(key: string): void {
		this.dependencies.delete(key);
		this.factories.delete(key);
	}

	/**
	 * Clear all dependencies (useful for testing)
	 */
	public clear(): void {
		this.dependencies.clear();
		this.factories.clear();
	}

	/**
	 * Reset the singleton instance (useful for testing)
	 */
	public static reset(): void {
		DependencyContainer.instance = undefined as unknown as DependencyContainer;
	}
} 