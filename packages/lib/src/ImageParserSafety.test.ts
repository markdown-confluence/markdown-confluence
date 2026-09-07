import { expect, test } from "@effect/vitest";
import { Worker } from "node:worker_threads";

function box(name: string, payload: Buffer, size = payload.length + 8): Buffer {
	const header = Buffer.alloc(8);
	header.writeUInt32BE(size);
	header.write(name, 4, "ascii");
	return Buffer.concat([header, payload]);
}

function heif(spatialExtent: Buffer): Buffer {
	return Buffer.concat([
		box("ftyp", Buffer.from("heic\0\0\0\0", "ascii")),
		box("meta", Buffer.concat([Buffer.alloc(4), box("iprp", box("ipco", spatialExtent))])),
	]);
}

/** Run parser regressions in a worker so a missing bounds check cannot hang the test runner. */
function parseWithDeadline(
	buffer: Buffer,
): Promise<{ width?: number; height?: number; error?: string }> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(
			`
			const { parentPort, workerData } = require("node:worker_threads");
			(async () => {
				const { imageSize } = await import(workerData.moduleUrl);
				try { parentPort.postMessage(imageSize(Buffer.from(workerData.hex, "hex"))); }
				catch (error) { parentPort.postMessage({ error: error.message }); }
			})().catch((error) => { throw error; });
		`,
			{
				eval: true,
				workerData: {
					moduleUrl: import.meta.resolve("image-size"),
					hex: buffer.toString("hex"),
				},
			},
		);
		const timer = setTimeout(() => {
			void worker.terminate();
			reject(new Error("Image parser failed to finish within 2 seconds"));
		}, 2000);
		worker.once("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		worker.once("message", (result) => {
			clearTimeout(timer);
			void worker.terminate();
			resolve(result);
		});
	});
}

test("rejects ICNS entries with zero length without looping", async () => {
	const malformed = Buffer.alloc(16);
	malformed.write("icns");
	malformed.writeUInt32BE(16, 4);
	malformed.write("icp4", 8);
	expect((await parseWithDeadline(malformed)).error).toContain("Invalid ICNS entry length");
	malformed.writeUInt32BE(8, 12);
	expect(await parseWithDeadline(malformed)).toMatchObject({ width: 16, height: 16 });
});

test("rejects truncated HEIF and JXL boxes without looping", async () => {
	const malformedHeif = heif(box("ispe", Buffer.alloc(0), 0));
	expect((await parseWithDeadline(malformedHeif)).error).toBeDefined();
	const malformedJxl = Buffer.concat([
		box("ftyp", Buffer.from("jxl \0\0\0\0", "ascii")),
		box("jxlp", Buffer.alloc(4), 0),
	]);
	expect((await parseWithDeadline(malformedJxl)).error).toBeDefined();
});

test("reads a valid HEIF box that extends to the end of the file", async () => {
	const extent = Buffer.alloc(12);
	extent.writeUInt32BE(17, 4);
	extent.writeUInt32BE(19, 8);
	expect(await parseWithDeadline(heif(box("ispe", extent, 0)))).toMatchObject({
		width: 17,
		height: 19,
	});
});
