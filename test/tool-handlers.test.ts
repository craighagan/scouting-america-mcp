import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { clearScoutingSession } from "../src/session.js";
import { listRegisteredTools } from "../src/tools/index.js";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

function makeJwt(exp: number): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${body}.sig`;
}

const FAR_EXP = Math.floor(Date.now() / 1000) + 3600;
const TEST_TOKEN = makeJwt(FAR_EXP);

interface RecordedCall {
  url: string;
  method: string;
  body?: unknown;
}

function installFetchMock(): RecordedCall[] {
  const calls: RecordedCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });

    if (url.includes("auth.scouting.org")) {
      return new Response(
        JSON.stringify({ token: TEST_TOKEN, account: { userId: 42 } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    // Return a generic success for all api.scouting.org calls
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

function getApiCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((c) => c.url.includes("api.scouting.org"));
}

// Create a mock ScoutingClient that records calls via the fetch mock
async function createMockClient() {
  // Import dynamically to get a fresh client that uses our mocked fetch
  const { createScoutingClient } = await import("../src/tools/client.js");
  return createScoutingClient();
}

beforeEach(() => {
  clearScoutingSession();
  process.env.SCOUT_USERNAME = "u@example.com";
  process.env.SCOUT_PASSWORD = "p";
  delete process.env.SCOUT_USER_ID;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
  clearScoutingSession();
});

// Get all tools and their handlers
const tools = listRegisteredTools();
function findTool(name: string) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`Tool ${name} not found in registry`);
  return t;
}

describe("catalog tool handlers", () => {
  it("list_ranks calls GET /advancements/ranks", async () => {
    const calls = installFetchMock();
    const tool = findTool("list_ranks");
    await tool.handler({}, await createMockClient());
    const api = getApiCalls(calls);
    assert.equal(api.length, 1);
    assert.match(api[0].url, /\/advancements\/ranks/);
    assert.equal(api[0].method, "GET");
  });

  it("list_adventures calls GET /advancements/adventures", async () => {
    const calls = installFetchMock();
    await findTool("list_adventures").handler({}, await createMockClient());
    const api = getApiCalls(calls);
    assert.match(api[0].url, /\/advancements\/adventures/);
  });

  it("list_awards calls GET /advancements/awards", async () => {
    const calls = installFetchMock();
    await findTool("list_awards").handler({}, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/advancements\/awards/);
  });

  it("list_merit_badges calls GET /advancements/meritBadges", async () => {
    const calls = installFetchMock();
    await findTool("list_merit_badges").handler({}, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/advancements\/meritBadges/);
  });

  it("list_ss_electives calls GET /advancements/ssElectives", async () => {
    const calls = installFetchMock();
    await findTool("list_ss_electives").handler({}, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/advancements\/ssElectives/);
  });
});

describe("requirements tool handlers", () => {
  it("get_rank calls GET /advancements/v2/ranks/:id", async () => {
    const calls = installFetchMock();
    await findTool("get_rank").handler({ rankId: 14 }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/advancements\/v2\/ranks\/14/);
  });

  it("get_rank_requirements passes versionId as query", async () => {
    const calls = installFetchMock();
    await findTool("get_rank_requirements").handler({ rankId: 14, versionId: 105 }, await createMockClient());
    const url = getApiCalls(calls)[0].url;
    assert.match(url, /\/advancements\/v2\/ranks\/14\/requirements/);
    assert.match(url, /versionId=105/);
  });

  it("get_merit_badge calls GET /advancements/v2/meritBadges/:id", async () => {
    const calls = installFetchMock();
    await findTool("get_merit_badge").handler({ meritBadgeId: 20 }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/advancements\/v2\/meritBadges\/20/);
  });

  it("get_merit_badge_requirements passes versionId", async () => {
    const calls = installFetchMock();
    await findTool("get_merit_badge_requirements").handler({ meritBadgeId: 20, versionId: 3 }, await createMockClient());
    const url = getApiCalls(calls)[0].url;
    assert.match(url, /\/advancements\/meritBadges\/20\/requirements/);
    assert.match(url, /versionId=3/);
  });

  it("get_award_requirements passes both IDs", async () => {
    const calls = installFetchMock();
    await findTool("get_award_requirements").handler({ awardId: 5, versionId: 2 }, await createMockClient());
    const url = getApiCalls(calls)[0].url;
    assert.match(url, /\/advancements\/awards\/5\/requirements/);
    assert.match(url, /versionId=2/);
  });
});

describe("youth tool handlers", () => {
  it("get_youth_ranks defaults userId to authenticated user", async () => {
    const calls = installFetchMock();
    await findTool("get_youth_ranks").handler({}, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/youth\/42\/ranks/);
  });

  it("get_youth_ranks uses provided userId", async () => {
    const calls = installFetchMock();
    await findTool("get_youth_ranks").handler({ userId: 99 }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/youth\/99\/ranks/);
  });

  it("get_youth_merit_badges calls correct path", async () => {
    const calls = installFetchMock();
    await findTool("get_youth_merit_badges").handler({ userId: 7 }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/youth\/7\/meritBadges/);
  });

  it("get_youth_ss_electives calls correct path", async () => {
    const calls = installFetchMock();
    await findTool("get_youth_ss_electives").handler({ userId: 7 }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/youth\/7\/ssElectives/);
  });

  it("get_youth_advancement_requirements includes type and id", async () => {
    const calls = installFetchMock();
    await findTool("get_youth_advancement_requirements").handler(
      { userId: 7, advancementType: "meritBadges", advancementId: 20 },
      await createMockClient(),
    );
    assert.match(getApiCalls(calls)[0].url, /\/youth\/7\/meritBadges\/20\/requirements/);
  });
});

describe("org tool handlers", () => {
  const GUID = "504992AD-1D27-46EA-B7A7-14F4BD5C8B41";

  it("list_organization_adults POSTs to /organizations/v2/:guid/adults", async () => {
    const calls = installFetchMock();
    await findTool("list_organization_adults").handler({ organizationGuid: GUID }, await createMockClient());
    const api = getApiCalls(calls)[0];
    assert.match(api.url, new RegExp(`/organizations/v2/${GUID}/adults`));
    assert.equal(api.method, "POST");
  });

  it("list_organization_youths GETs /organizations/v2/units/:guid/youths", async () => {
    const calls = installFetchMock();
    await findTool("list_organization_youths").handler({ organizationGuid: GUID }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, new RegExp(`/units/${GUID}/youths`));
  });

  it("list_unit_parents GETs /organizations/v2/units/:guid/parents", async () => {
    const calls = installFetchMock();
    await findTool("list_unit_parents").handler({ organizationGuid: GUID }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/units\/.*\/parents/);
  });

  it("list_sub_units GETs /organizations/v2/units/:guid/subUnits", async () => {
    const calls = installFetchMock();
    await findTool("list_sub_units").handler({ organizationGuid: GUID }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/subUnits/);
  });

  it("get_advancement_dashboard GETs /organizations/v2/:guid/advancementDashboard", async () => {
    const calls = installFetchMock();
    await findTool("get_advancement_dashboard").handler({ organizationGuid: GUID }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/advancementDashboard/);
  });

  it("get_advancements_ready_to_award POSTs with advancementType query", async () => {
    const calls = installFetchMock();
    await findTool("get_advancements_ready_to_award").handler(
      { organizationGuid: GUID, advancementType: "meritBadge" },
      await createMockClient(),
    );
    const api = getApiCalls(calls)[0];
    assert.equal(api.method, "POST");
    assert.match(api.url, /advancementsReadyToBeAwarded/);
    assert.match(api.url, /advancementType=meritBadge/);
  });

  it("list_unit_leadership_positions GETs correct path", async () => {
    const calls = installFetchMock();
    await findTool("list_unit_leadership_positions").handler({ organizationGuid: GUID }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/leadershipPositions/);
  });

  it("list_pending_leadership GETs correct path", async () => {
    const calls = installFetchMock();
    await findTool("list_pending_leadership").handler({ organizationGuid: GUID }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/pendingLeadershipPositions/);
  });

  it("get_org_merit_badge_progress includes orgGuid and mbId", async () => {
    const calls = installFetchMock();
    await findTool("get_org_merit_badge_progress").handler(
      { organizationGuid: GUID, meritBadgeId: 20 },
      await createMockClient(),
    );
    const url = getApiCalls(calls)[0].url;
    assert.match(url, new RegExp(`organization/${GUID}`));
    assert.match(url, /meritBadges\/20\/userRequirements/);
  });

  it("get_org_rank_progress includes orgGuid and rankId", async () => {
    const calls = installFetchMock();
    await findTool("get_org_rank_progress").handler(
      { organizationGuid: GUID, rankId: 5 },
      await createMockClient(),
    );
    assert.match(getApiCalls(calls)[0].url, /ranks\/5\/userRequirements/);
  });

  it("get_org_adventure_progress includes orgGuid and adventureId", async () => {
    const calls = installFetchMock();
    await findTool("get_org_adventure_progress").handler(
      { organizationGuid: GUID, adventureId: 10 },
      await createMockClient(),
    );
    assert.match(getApiCalls(calls)[0].url, /adventures\/10\/userRequirements/);
  });

  it("get_org_award_progress includes orgGuid and awardId", async () => {
    const calls = installFetchMock();
    await findTool("get_org_award_progress").handler(
      { organizationGuid: GUID, awardId: 3 },
      await createMockClient(),
    );
    assert.match(getApiCalls(calls)[0].url, /awards\/3\/userRequirements/);
  });

  it("get_org_payment_logs GETs correct path", async () => {
    const calls = installFetchMock();
    await findTool("get_org_payment_logs").handler({ organizationGuid: GUID }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/paymentLogs/);
  });

  it("get_unit_activities_dashboard GETs correct path", async () => {
    const calls = installFetchMock();
    await findTool("get_unit_activities_dashboard").handler({ organizationGuid: GUID }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/unitActivitiesDashboard/);
  });
});

describe("search tool handlers", () => {
  it("search_units POSTs to /organizations/units/search", async () => {
    const calls = installFetchMock();
    await findTool("search_units").handler({ unitNumber: "6", state: "MA" }, await createMockClient());
    const api = getApiCalls(calls)[0];
    assert.equal(api.method, "POST");
    assert.match(api.url, /\/organizations\/units\/search/);
    assert.deepEqual(api.body, { unitNumber: "6", state: "MA" });
  });

  it("search_camps POSTs to /organizations/camps/search", async () => {
    const calls = installFetchMock();
    await findTool("search_camps").handler({ zip: "02445" }, await createMockClient());
    const api = getApiCalls(calls)[0];
    assert.match(api.url, /\/camps\/search/);
    assert.deepEqual(api.body, { zip: "02445" });
  });

  it("search_orgs_nearby POSTs to /organizations/organizationsWithinRadius", async () => {
    const calls = installFetchMock();
    await findTool("search_orgs_nearby").handler({ zip: "02445", radius: 10 }, await createMockClient());
    const api = getApiCalls(calls)[0];
    assert.match(api.url, /organizationsWithinRadius/);
  });

  it("search_relationships POSTs to /persons/v2/relationshipSearch", async () => {
    const calls = installFetchMock();
    await findTool("search_relationships").handler({ personGuid: "ABC-123" }, await createMockClient());
    const api = getApiCalls(calls)[0];
    assert.match(api.url, /\/relationshipSearch/);
    assert.deepEqual(api.body, { personGuid: "ABC-123" });
  });

  it("search_merit_badge_counselors POSTs to correct path", async () => {
    const calls = installFetchMock();
    await findTool("search_merit_badge_counselors").handler({ zipCode: "02445" }, await createMockClient());
    const api = getApiCalls(calls)[0];
    assert.match(api.url, /\/counselors\/search/);
  });
});

describe("MBC tool handlers", () => {
  it("get_mbc_profile GETs /counselors/:id/profile", async () => {
    const calls = installFetchMock();
    await findTool("get_mbc_profile").handler({ memberId: 12408161 }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/counselors\/12408161\/profile/);
  });

  it("get_mbc_dashboard GETs /counselors/:id/dashboard", async () => {
    const calls = installFetchMock();
    await findTool("get_mbc_dashboard").handler({ personGuidOrMID: "ABC-123" }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/counselors\/ABC-123\/dashboard/);
  });

  it("get_mbc_assigned_youths POSTs to correct path", async () => {
    const calls = installFetchMock();
    await findTool("get_mbc_assigned_youths").handler({}, await createMockClient());
    const api = getApiCalls(calls)[0];
    assert.equal(api.method, "POST");
    assert.match(api.url, /\/counselors\/youths\/assigned/);
  });
});

describe("history tool handlers", () => {
  it("get_advancement_history POSTs with userId defaulting to authenticated user", async () => {
    const calls = installFetchMock();
    await findTool("get_advancement_history").handler({ organizationGuid: "ABC" }, await createMockClient());
    const api = getApiCalls(calls)[0];
    assert.equal(api.method, "POST");
    assert.match(api.url, /\/advancementHistory/);
    assert.equal((api.body as Record<string, unknown>).userId, "42");
    assert.equal((api.body as Record<string, unknown>).organizationGuid, "ABC");
  });
});

describe("person tool handlers", () => {
  it("get_person_profile GETs /persons/v2/:guid/personprofile", async () => {
    const calls = installFetchMock();
    await findTool("get_person_profile").handler({ personId: "ABC-GUID" }, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/persons\/v2\/ABC-GUID\/personprofile/);
  });

  it("get_my_scout GETs /persons/:userId/myScout", async () => {
    const calls = installFetchMock();
    await findTool("get_my_scout").handler({}, await createMockClient());
    assert.match(getApiCalls(calls)[0].url, /\/persons\/42\/myScout/);
  });
});

describe("meta tool handlers", () => {
  it("whoami returns session without calling the API", async () => {
    const calls = installFetchMock();
    const result = await findTool("whoami").handler({}, await createMockClient());
    // whoami triggers login (1 auth call) but no api.scouting.org call
    const apiCalls = calls.filter(
      (c) => c.url.includes("api.scouting.org"),
    );
    assert.equal(apiCalls.length, 0);
    assert.equal(result.isError, false);
  });

  it("api_request calls rawRequest with provided path/method", async () => {
    const calls = installFetchMock();
    await findTool("api_request").handler(
      { path: "/test/path", method: "GET" },
      await createMockClient(),
    );
    const api = getApiCalls(calls);
    assert.equal(api.length, 1);
    assert.match(api[0].url, /\/test\/path/);
  });
});
