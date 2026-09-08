const cancellationFactories = new WeakMap<object, (signal: AbortSignal) => object>();

/** Register an isolated client factory so SDK closures use the operation's transport. */
export function registerPublishCancellation<T extends object>(
	client: T,
	factory: (signal: AbortSignal) => T,
): T {
	cancellationFactories.set(client, factory);
	return client;
}

export class PublishCancelledError extends Error {
	constructor() {
		super("Publishing cancelled. Completed writes have been kept.");
		this.name = "PublishCancelledError";
	}
}

export function assertPublishingActive(signal?: AbortSignal): void {
	if (signal?.aborted) throw new PublishCancelledError();
}

/** Cooperative cancellation: finish the current request, then stop issuing requests.
 * Repository clients copy their transport; custom clients retain a method-boundary guard.
 * Successful writes are not rolled back. Do not abort a write with an unknown outcome.
 */
export function cancellableClient<T extends object>(client: T, signal: AbortSignal): T {
	const wrappers = new WeakMap<object, object>();
	const wrap = (target: object): object => {
		const cached = wrappers.get(target);
		if (cached) return cached;
		const factory = cancellationFactories.get(target);
		if (factory) {
			const scoped = factory(signal);
			wrappers.set(target, scoped);
			return scoped;
		}
		const proxy = new Proxy(target, {
			get(object, key) {
				const value = Reflect.get(object, key);
				if (typeof value === "function")
					return (...args: unknown[]) => {
						assertPublishingActive(signal);
						return Reflect.apply(value, object, args);
					};
				return value && typeof value === "object" ? wrap(value) : value;
			},
		});
		wrappers.set(target, proxy);
		return proxy;
	};
	return wrap(client) as T;
}
