import type { Client } from "confluence.js/core";
import { createV1Client } from "confluence.js";

type Principal = { accountId?: string; id?: string };
type RestrictionPage = {
	restrictions?: Partial<
		Record<
			"user" | "group",
			{ results: Principal[]; size?: number; limit?: number; _links?: { next?: string } }
		>
	>;
};

/** Read each collection independently: restrictions paginate users and groups separately. */
async function editors(client: Client, id: string, kind: "user" | "group") {
	const values: string[] = [];
	for (let start = 0; ; ) {
		const page = await client.sendRequest<RestrictionPage>({
			method: "GET",
			url: `/wiki/rest/api/content/${encodeURIComponent(id)}/restriction/byOperation/update`,
			searchParams: { expand: `restrictions.${kind}`, start, limit: 100 },
		});
		const collection = page.restrictions?.[kind];
		if (!collection || !Array.isArray(collection.results))
			throw new Error("Confluence returned incomplete edit restrictions");
		for (const principal of collection.results) {
			const value = kind === "user" ? principal.accountId : principal.id;
			if (!value) throw new Error("Confluence returned an editor without an ID");
			values.push(value);
		}
		if (!collection._links?.next && collection.results.length < (collection.limit ?? 100))
			return values;
		if (!collection.results.length)
			throw new Error("Confluence restriction pagination did not advance");
		start += collection.results.length;
	}
}

/** Only update restrictions are touched. Never remove the publishing account. */
export async function lockPageEditing(
	client: Client,
	id: string,
	accountId: string,
): Promise<"same" | "updated"> {
	if (!accountId) throw new Error("Cannot lock a page without the publishing account ID");
	const users = await editors(client, id, "user");
	const groups = await editors(client, id, "group");
	if (users.length === 1 && users[0] === accountId && groups.length === 0) return "same";
	const api = createV1Client(client).contentRestrictions;
	// Establish a surviving editor before removing any existing grants.
	await api.addUserToContentRestriction({ id, operationKey: "update", accountId });
	for (const user of users)
		if (user !== accountId)
			await api.removeUserFromContentRestriction({
				id,
				operationKey: "update",
				accountId: user,
			});
	for (const groupId of groups)
		await api.removeGroupFromContentRestriction({ id, operationKey: "update", groupId });
	const remainingUsers = await editors(client, id, "user");
	const remainingGroups = await editors(client, id, "group");
	if (remainingUsers.length !== 1 || remainingUsers[0] !== accountId || remainingGroups.length)
		throw new Error(
			"Confluence edit restrictions did not match the requested lock; retry publishing",
		);
	return "updated";
}
