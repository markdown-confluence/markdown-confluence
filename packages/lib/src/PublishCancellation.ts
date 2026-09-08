/** Cooperative cancellation: finish the current request, then stop issuing requests.
 * Successful writes are not rolled back. Do not abort a write with an unknown outcome.
 */
export function cancellableClient<T extends object>(client: T, signal: AbortSignal): T {
	const wrappers = new WeakMap<object, object>();
	const wrap = (target: object): object => {
		const cached = wrappers.get(target);
		if (cached) return cached;
		const proxy = new Proxy(target, {
			get(object, key) {
				const value = Reflect.get(object, key);
				if (typeof value === "function")
					return (...args: unknown[]) => {
						if (signal.aborted)
							throw new Error(
								"Publishing cancelled. Completed writes have been kept.",
							);
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
