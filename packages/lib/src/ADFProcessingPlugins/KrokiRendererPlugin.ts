import { filter, traverse } from "@atlaskit/adf-utils/traverse";
import type { JSONDocNode } from "@atlaskit/editor-json-transformer";
import type { ADFEntity } from "@atlaskit/adf-utils/types";
import SparkMD5 from "spark-md5";
import { Effect } from "effect";
import type { UploadedImageData } from "../Attachments";
import { runEffect } from "../effects";
import type { ADFProcessingPlugin, PublisherFunctions } from "./types";

type KrokiFetch = (
	url: string,
	init: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "headers" | "arrayBuffer">>;

export interface KrokiSettings {
	enabled: boolean;
	serverUrl: string;
	format: "png" | "svg";
	timeoutMs: number;
}
export const DEFAULT_KROKI_SETTINGS: KrokiSettings = {
	enabled: false,
	serverUrl: "",
	format: "png",
	timeoutMs: 30000,
};
export interface KrokiChart {
	name: string;
	data: string;
	diagramType: string;
}

function diagramType(language: unknown): string | undefined {
	if (typeof language !== "string" || !language.toLowerCase().startsWith("kroki-")) return;
	const type = language.slice(6).toLowerCase();
	if (!/^[a-z][a-z0-9-]*$/.test(type))
		throw new Error("Invalid Kroki diagram type; use kroki-graphviz, for example");
	return type;
}
export function getKrokiFileName(type: string, source: string, format: "png" | "svg") {
	return `RenderedKrokiChart-${SparkMD5.hash(JSON.stringify([type, source]))}.${format}`;
}

/** Explicitly configured rendering service. Never receives Confluence credentials. */
export class HttpKrokiRenderer {
	readonly format: "png" | "svg";
	private readonly serverUrl: string;
	private readonly timeoutMs: number;
	private readonly request: KrokiFetch;
	constructor(options: Omit<KrokiSettings, "enabled"> & { fetchImpl?: KrokiFetch }) {
		const url = new URL(options.serverUrl);
		if (
			!["http:", "https:"].includes(url.protocol) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash
		)
			throw new Error(
				"Kroki server must be an HTTP(S) URL without credentials, query or fragment",
			);
		if (!["png", "svg"].includes(options.format))
			throw new Error("Kroki format must be png or svg");
		if (
			!Number.isSafeInteger(options.timeoutMs) ||
			options.timeoutMs < 1 ||
			options.timeoutMs > 2147483647
		)
			throw new Error("Kroki timeout must be a positive integer no greater than 2147483647");
		this.serverUrl = url.href.replace(/\/$/, "");
		this.format = options.format;
		this.timeoutMs = options.timeoutMs;
		this.request = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
	}
	async capture(charts: KrokiChart[]): Promise<Map<string, Buffer>> {
		const result = new Map<string, Buffer>();
		// Sequential requests bound service load and stop immediately after a failure.
		for (const chart of charts) {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), this.timeoutMs);
			try {
				const response = await this.request(this.serverUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: this.format === "png" ? "image/png" : "image/svg+xml",
					},
					body: JSON.stringify({
						diagram_source: chart.data,
						diagram_type: chart.diagramType,
						output_format: this.format,
					}),
					signal: controller.signal,
					redirect: "error",
				});
				if (!response.ok)
					throw new Error(
						`Kroki rendering failed: HTTP ${response.status} (${chart.diagramType})`,
					);
				const expected = this.format === "png" ? "image/png" : "image/svg+xml";
				if (response.headers.get("content-type")?.split(";")[0]?.trim() !== expected)
					throw new Error(
						`Kroki returned an unexpected content type; expected ${expected}`,
					);
				const bytes = Buffer.from(await response.arrayBuffer());
				if (
					this.format === "png"
						? !bytes
								.subarray(0, 8)
								.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
						: !/<svg[\s>]/i.test(bytes.toString())
				)
					throw new Error("Kroki returned invalid image data");
				result.set(chart.name, bytes);
			} catch (error) {
				if (controller.signal.aborted)
					throw new Error(`Kroki rendering timed out after ${this.timeoutMs}ms`);
				throw error;
			} finally {
				clearTimeout(timer);
			}
		}
		return result;
	}
}

export class KrokiRendererPlugin implements ADFProcessingPlugin<
	KrokiChart[],
	Record<string, UploadedImageData | null>
> {
	constructor(private readonly renderer: HttpKrokiRenderer) {}
	extract(adf: JSONDocNode): KrokiChart[] {
		const charts = new Map<string, KrokiChart>();
		for (const node of filter(adf, (node) => node.type === "codeBlock")) {
			const type = diagramType(node.attrs?.["language"]);
			const source = node.content?.map((child) => child?.text ?? "").join("");
			if (!type || !source?.trim()) continue;
			const name = getKrokiFileName(type, source, this.renderer.format);
			charts.set(name, { name, data: source, diagramType: type });
		}
		return [...charts.values()];
	}
	transform(charts: KrokiChart[], support: PublisherFunctions) {
		return runEffect(this.transformEffect(charts, support));
	}
	transformEffect(charts: KrokiChart[], support: PublisherFunctions) {
		const renderer = this.renderer;
		return Effect.gen(function* () {
			const images = yield* Effect.tryPromise({
				try: () => renderer.capture(charts),
				catch: (error) => error,
			});
			const result: Record<string, UploadedImageData | null> = {};
			for (const [name, bytes] of images)
				result[name] = yield* support.uploadBufferEffect(
					name,
					bytes,
					renderer.format === "png" ? "image/png" : "image/svg+xml",
				);
			return result;
		});
	}
	load(adf: JSONDocNode, images: Record<string, UploadedImageData | null>): JSONDocNode {
		return (traverse(adf as ADFEntity, {
			codeBlock: (node) => {
				const type = diagramType(node.attrs?.["language"]);
				const source = node.content?.map((child) => child?.text ?? "").join("");
				if (!type || !source?.trim()) return;
				const image = images[getKrokiFileName(type, source, this.renderer.format)];
				if (!image) return;
				return {
					type: "mediaSingle",
					attrs: { layout: "center" },
					content: [
						{
							type: "media",
							attrs: {
								type: "file",
								collection: image.collection,
								id: image.id,
								width: image.width,
								height: image.height,
							},
						},
					],
				};
			},
		}) ?? adf) as JSONDocNode;
	}
}
