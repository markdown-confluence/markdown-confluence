import { expect, test } from "@effect/vitest";
import type { Client } from "confluence.js/core";
import { lockPageEditing } from "./PageEditLock";

function fixture(initialUsers: string[], initialGroups: string[], failRemove = false) {
	const users = new Set(initialUsers),
		groups = new Set(initialGroups);
	const writes: string[] = [];
	const client: Client = {
		async sendRequest<T>(request): Promise<T> {
			expect(request.url).toContain("/byOperation/update");
			if (request.method === "GET") {
				const kind =
					request.searchParams?.expand === "restrictions.user" ? "user" : "group";
				const all = [...(kind === "user" ? users : groups)];
				const start = Number(request.searchParams?.start ?? 0);
				return {
					restrictions: {
						[kind]: {
							results: all
								.slice(start, start + 100)
								.map((value) =>
									kind === "user" ? { accountId: value } : { id: value },
								),
							limit: 100,
						},
					},
				} as T;
			}
			writes.push(`${request.method} ${request.url}`);
			if (request.method === "PUT") users.add(String(request.searchParams?.accountId));
			else {
				expect(users.has("publisher")).toBe(true);
				if (failRemove) throw Error("forbidden");
				if (request.url.includes("/byGroupId/"))
					groups.delete(request.url.split("/").at(-1)!);
				else users.delete(String(request.searchParams?.accountId));
			}
			return undefined as T;
		},
	};
	return { client, users, groups, writes };
}

test("locks unrestricted pages and does not write on repeated publication", async () => {
	const f = fixture([], []);
	expect(await lockPageEditing(f.client, "123", "publisher")).toBe("updated");
	expect([...f.users]).toEqual(["publisher"]);
	expect(await lockPageEditing(f.client, "123", "publisher")).toBe("same");
	expect(f.writes).toHaveLength(1);
});
test("removes all other editors across pagination without touching read restrictions", async () => {
	const f = fixture(
		Array.from({ length: 102 }, (_, i) => `user-${i}`),
		["editors"],
	);
	await lockPageEditing(f.client, "123", "publisher");
	expect([...f.users]).toEqual(["publisher"]);
	expect([...f.groups]).toEqual([]);
	expect(f.writes[0]).toMatch(/^PUT/);
});
test("retains publisher access and reports a failed restriction change", async () => {
	const f = fixture(["other"], [], true);
	await expect(lockPageEditing(f.client, "123", "publisher")).rejects.toThrow("forbidden");
	expect(f.users.has("publisher")).toBe(true);
});
