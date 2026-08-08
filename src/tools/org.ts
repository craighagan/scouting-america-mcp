import { createToolResponse } from "./responses.js";
import { registerTool } from "./toolRegistry.js";

registerTool(
  "list_organization_adults",
  {
    description:
      "Lists adult members (leaders, committee, functional roles) registered in a unit organization. POST-as-filter; returns organizationInfo and a members array with positions, contact info, YPT status, and registration details. Requires the organization's UUID (`organizationGuid`).",
    inputSchema: {
      type: "object",
      properties: {
        organizationGuid: {
          type: "string",
          description:
            "Organization UUID (e.g. 504992AD-1D27-46EA-B7A7-14F4BD5C8B41).",
        },
      },
      required: ["organizationGuid"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  async (args, client) => {
    const data = await client.postFilter(
      `/organizations/v2/${args.organizationGuid}/adults`,
      {},
    );
    return createToolResponse(data);
  },
);

registerTool(
  "list_organization_youths",
  {
    description:
      "Lists youth members registered in a unit organization. Returns unit info and a users array with rank progress, contact info, positions, patrol assignments, and date joined. Requires the organization's UUID (`organizationGuid`).",
    inputSchema: {
      type: "object",
      properties: {
        organizationGuid: {
          type: "string",
          description:
            "Organization UUID (e.g. 504992AD-1D27-46EA-B7A7-14F4BD5C8B41).",
        },
      },
      required: ["organizationGuid"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  async (args, client) => {
    const data = await client.get(
      `/organizations/v2/units/${args.organizationGuid}/youths`,
    );
    return createToolResponse(data);
  },
);

registerTool(
  "get_organization_profile",
  {
    description:
      "Fetches the profile (council/district/unit metadata) for an organization. Requires the organization's UUID (`organizationGuid`).",
    inputSchema: {
      type: "object",
      properties: {
        organizationGuid: {
          type: "string",
          description: "Organization UUID (e.g. F45624D7-0998-41F5-86F6-26061D93324E).",
        },
      },
      required: ["organizationGuid"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  async (args, client) => {
    const data = await client.get(
      `/organizations/v2/${args.organizationGuid}/profile`,
    );
    return createToolResponse(data);
  },
);
