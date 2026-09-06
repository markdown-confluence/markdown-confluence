import { ChartData, PlantumlRenderer } from "@markdown-confluence/lib";
import plantumlEncoder from "plantuml-encoder";

export type PlantumlOutputFormat = "png" | "svg";

export interface HttpPlantumlRendererOptions {
	serverUrl: string;
	format?: PlantumlOutputFormat;
	timeoutMs?: number;
	concurrency?: number;
	fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 5;

function trimTrailingSlash(url: string): string {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function runWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = Array.from<R>({ length: items.length });
	let cursor = 0;

	const runnerCount = Math.min(Math.max(concurrency, 1), items.length);
	const runners = Array.from({ length: runnerCount }, async () => {
		while (true) {
			const index = cursor++;
			if (index >= items.length) {
				return;
			}
			const item = items[index] as T;
			results[index] = await worker(item, index);
		}
	});

	await Promise.all(runners);
	return results;
}

export class HttpPlantumlRenderer implements PlantumlRenderer {
	private readonly serverUrl: string;
	private readonly format: PlantumlOutputFormat;
	private readonly timeoutMs: number;
	private readonly concurrency: number;
	private readonly fetchImpl: typeof fetch;

	constructor(options: HttpPlantumlRendererOptions) {
		if (!options.serverUrl) {
			throw new Error(
				"HttpPlantumlRenderer: serverUrl is required (e.g. https://www.plantuml.com/plantuml)",
			);
		}

		const rawFetch = options.fetchImpl ?? globalThis.fetch;
		if (typeof rawFetch !== "function") {
			throw new Error(
				"HttpPlantumlRenderer: global fetch is unavailable; pass options.fetchImpl or run on Node 18+",
			);
		}

		this.serverUrl = trimTrailingSlash(options.serverUrl);
		this.format = options.format ?? "png";
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
		// Bind to globalThis so the browser/Electron `fetch` keeps its `this`
		// when called as a method on the class (otherwise it throws
		// "Failed to execute 'fetch' on 'Window': Illegal invocation").
		this.fetchImpl = options.fetchImpl ?? (rawFetch as typeof fetch).bind(globalThis);
	}

	async capturePlantumlCharts(charts: ChartData[]): Promise<Map<string, Buffer>> {
		const out = new Map<string, Buffer>();

		const buffers = await runWithConcurrency(charts, this.concurrency, (chart) =>
			this.renderOne(chart),
		);

		for (let i = 0; i < charts.length; i++) {
			const chart = charts[i] as ChartData;
			const buffer = buffers[i] as Buffer;
			out.set(chart.name, buffer);
		}

		return out;
	}

	private async renderOne(chart: ChartData): Promise<Buffer> {
		const encoded = plantumlEncoder.encode(chart.data);
		const url = `${this.serverUrl}/${this.format}/${encoded}`;

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const response = await this.fetchImpl(url, { signal: controller.signal });

			if (!response.ok) {
				const bodyPreview = await response.text().catch(() => "");
				throw new Error(
					`PlantUML server returned ${response.status} ${response.statusText} for ${chart.name} (server=${this.serverUrl}): ${bodyPreview.slice(0, 200)}`,
				);
			}

			const arrayBuffer = await response.arrayBuffer();
			return Buffer.from(arrayBuffer);
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				throw new Error(
					`PlantUML render timed out after ${this.timeoutMs}ms for ${chart.name} (server=${this.serverUrl})`,
				);
			}
			if (error instanceof Error) {
				throw new Error(
					`PlantUML render failed for ${chart.name} (server=${this.serverUrl}): ${error.message}`,
				);
			}
			throw error;
		} finally {
			clearTimeout(timer);
		}
	}
}
