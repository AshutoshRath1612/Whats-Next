import assert from "node:assert/strict";
import test from "node:test";
import { FilesService } from "./files.service";

test("FilesService stores uploads under readable workspace R2 prefixes", async () => {
  const createdFiles: Array<{ data: { url: string; entityType?: string | null; entityId?: string | null } }> = [];
  const prisma = {
    workspaceMember: {
      findUnique: async () => ({ id: "membership-id" })
    },
    fileAsset: {
      create: async (input: { data: { url: string; entityType?: string | null; entityId?: string | null } }) => {
        createdFiles.push(input);
        return { id: `file-${createdFiles.length}`, createdAt: new Date(), ...input.data };
      }
    },
    auditLog: {
      create: async () => ({ id: "audit-id" })
    }
  };
  const configValues: Record<string, string> = {
    CLOUDFLARE_R2_ACCOUNT_ID: "account-id",
    CLOUDFLARE_R2_ACCESS_KEY_ID: "access-key",
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: "secret-key",
    CLOUDFLARE_R2_BUCKET: "workspace-files",
    FILE_UPLOAD_MAX_BYTES: "10mb"
  };
  const config = {
    get: (key: string) => configValues[key]
  };
  const requestedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input));
    return new Response("", { status: 200 });
  };

  try {
    const service = new FilesService(prisma as never, config as never);
    const workspaceId = "3ee1ed7f-5df1-4bfc-b567-89f0e2e26b44";
    const fileBytes = Buffer.from("file body").toString("base64");

    await service.upload("user-id", {
      workspaceId,
      name: "Incident Notes.pdf",
      mimeType: "application/pdf",
      size: 9,
      entityType: "Task",
      entityId: "7af29d2b-0bf5-49f8-88a5-a6f6705bbbd1",
      dataBase64: fileBytes
    });
    await service.upload("user-id", {
      workspaceId,
      name: "whats-next-export-2026-07-03.json",
      mimeType: "application/json",
      size: 9,
      entityType: "Backup",
      dataBase64: fileBytes
    });

    assert.match(
      requestedUrls[0],
      /\/workspace-files\/workspaces\/3ee1ed7f-5df1-4bfc-b567-89f0e2e26b44\/files\/\d{4}\/\d{2}\/\d{2}\/task\/7af29d2b-0bf5-49f8-88a5-a6f6705bbbd1\/[0-9a-f-]{36}\/Incident-Notes\.pdf$/
    );
    assert.match(
      requestedUrls[1],
      /\/workspace-files\/workspaces\/3ee1ed7f-5df1-4bfc-b567-89f0e2e26b44\/backups\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]{36}\/whats-next-export-2026-07-03\.json$/
    );
    assert.equal(createdFiles[0].data.entityType, "Task");
    assert.equal(createdFiles[1].data.entityType, "Backup");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
