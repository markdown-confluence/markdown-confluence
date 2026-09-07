export function toRequestArrayBuffer(buffer: Uint8Array): ArrayBuffer {
	// Buffer views may share a larger pool. Send only this view's bytes.
	return Uint8Array.from(buffer).buffer;
}
