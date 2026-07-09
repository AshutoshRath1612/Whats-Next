import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "./auth.service";

test("AuthService bootstraps quietly when no auth cookies are present", async () => {
  const service = new AuthService({} as never, {} as never, { get: () => undefined } as never);

  const result = await service.bootstrapSession(null, null);

  assert.deepEqual(result, { authenticated: false });
});

test("AuthService bootstraps from a valid access token without requiring refresh", async () => {
  const service = new AuthService(
    {
      authSession: {
        findFirst: async () => ({
          user: { id: "user-1", email: "user@example.com", name: "User One" }
        })
      }
    } as never,
    {
      verify: () => ({ sub: "user-1", sid: "session-1" })
    } as never,
    { get: () => undefined } as never
  );

  const result = await service.bootstrapSession("access-token", null);

  assert.equal(result.authenticated, true);
  if (result.authenticated) {
    assert.equal(result.accessToken, "access-token");
    assert.deepEqual(result.user, { id: "user-1", email: "user@example.com", name: "User One" });
  }
});
