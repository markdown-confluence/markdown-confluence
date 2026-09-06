import { Cause } from "effect";

export function getErrorMessage(error: unknown): string {
	const message = formatUnknownError(error, new WeakSet());
	return message.trim().length > 0 ? message : "Unknown error";
}

function formatUnknownError(error: unknown, seenErrors: WeakSet<object>): string {
	if (error !== null && typeof error === "object") {
		if (seenErrors.has(error)) return "[Circular error]";
		seenErrors.add(error);
	}
	if (Cause.isCause(error)) {
		return Cause.pretty(error);
	}

	if (error instanceof Error) {
		const errorMessage = error.message.trim();
		const message = errorMessage.length > 0 ? errorMessage : error.stack || error.name;
		const causeMessage = formatErrorCause(error.cause, seenErrors);
		return joinMessages([message, causeMessage]);
	}

	if (typeof error === "string") {
		return error;
	}

	if (error === null) {
		return "null";
	}

	if (error === undefined) {
		return "undefined";
	}

	if (typeof error === "object") {
		const message = getStringProperty(error, "message");
		const causeMessage = formatErrorCause(getObjectProperty(error, "cause"), seenErrors);
		const serializedError = stringifyObject(error);
		return joinMessages([message, serializedError, causeMessage]);
	}

	return String(error);
}

function formatErrorCause(cause: unknown, seenErrors: WeakSet<object>): string {
	if (cause === undefined) {
		return "";
	}

	return `Caused by: ${formatUnknownError(cause, seenErrors)}`;
}

function getObjectProperty(source: object, propertyName: string): unknown {
	return propertyName in source ? (source as Record<string, unknown>)[propertyName] : undefined;
}

function getStringProperty(source: object, propertyName: string): string {
	const propertyValue = getObjectProperty(source, propertyName);
	return typeof propertyValue === "string" ? propertyValue : "";
}

function stringifyObject(source: object): string {
	try {
		const serializedError = JSON.stringify(
			source,
			(key, value: unknown) =>
				/token|secret|password|cookie|authorization/i.test(key) ? "[REDACTED]" : value,
			2,
		);
		return serializedError && serializedError !== "{}" ? serializedError : "";
	} catch {
		return "";
	}
}

function joinMessages(messages: string[]): string {
	return messages.filter((message) => message.trim().length > 0).join("\n");
}
