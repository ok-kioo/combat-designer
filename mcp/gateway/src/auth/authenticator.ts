import type { Principal } from "@combat-designer/backend";
import { PrincipalSchema, McpError } from "@combat-designer/backend";

export class GatewayAuthenticator {
  authenticate(principalCandidate: unknown): Principal {
    if (!principalCandidate) {
      throw new McpError("UNAUTHENTICATED", "Authentication required: principal context is missing.");
    }

    const parseResult = PrincipalSchema.safeParse(principalCandidate);
    if (!parseResult.success) {
      throw new McpError(
        "UNAUTHENTICATED",
        `Invalid principal structure: ${parseResult.error.message}`
      );
    }

    return parseResult.data;
  }
}
