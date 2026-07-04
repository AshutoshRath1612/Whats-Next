-- Persist note version history and scope time entries to a workspace.

CREATE TABLE "NoteVersion" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteVersion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteVersion" ADD CONSTRAINT "NoteVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "NoteVersion_noteId_savedAt_idx" ON "NoteVersion"("noteId", "savedAt");
CREATE INDEX "NoteVersion_workspaceId_idx" ON "NoteVersion"("workspaceId");

ALTER TABLE "TimeEntry" ADD COLUMN "workspaceId" TEXT;

UPDATE "TimeEntry"
SET "workspaceId" = "Task"."workspaceId"
FROM "Task"
WHERE "TimeEntry"."taskId" = "Task"."id"
  AND "TimeEntry"."workspaceId" IS NULL;

UPDATE "TimeEntry"
SET "workspaceId" = first_workspace."workspaceId"
FROM (
  SELECT DISTINCT ON ("userId") "userId", "workspaceId"
  FROM "WorkspaceMember"
  ORDER BY "userId", "createdAt" ASC
) AS first_workspace
WHERE "TimeEntry"."userId" = first_workspace."userId"
  AND "TimeEntry"."workspaceId" IS NULL;

DELETE FROM "TimeEntry" WHERE "workspaceId" IS NULL;

ALTER TABLE "TimeEntry" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TimeEntry_workspaceId_idx" ON "TimeEntry"("workspaceId");
CREATE INDEX "TimeEntry_userId_workspaceId_idx" ON "TimeEntry"("userId", "workspaceId");
