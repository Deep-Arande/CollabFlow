-- AI features migration: project-scoped documents, extracted text, catch-me-up
-- cache, and the pgvector-backed DocumentChunk store.
--
-- NOTE: The `vector` type and the `ivfflat` index are pgvector-specific and cannot
-- be expressed in schema.prisma — they are written by hand here. Do not "fix" the
-- DocumentChunk.embedding column to a Prisma-native type.

-- 1. pgvector extension (must exist before any vector column is created)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. New enum
CREATE TYPE "AttachmentScope" AS ENUM ('TASK', 'PROJECT');

-- 3. Project: cached Catch-Me-Up summary
ALTER TABLE "Project" ADD COLUMN     "catchMeUpSummary" TEXT;
ALTER TABLE "Project" ADD COLUMN     "catchMeUpAt" TIMESTAMP(3);

-- 4. Attachment: make taskId optional, add projectId / scope / extractedText.
--    Existing rows are all task-scoped, so backfill projectId from the task and
--    set scope = 'TASK' before enforcing NOT NULL.
ALTER TABLE "Attachment" ALTER COLUMN "taskId" DROP NOT NULL;
ALTER TABLE "Attachment" ADD COLUMN     "projectId" TEXT;
ALTER TABLE "Attachment" ADD COLUMN     "extractedText" TEXT;
ALTER TABLE "Attachment" ADD COLUMN     "scope" "AttachmentScope";

UPDATE "Attachment" a SET "projectId" = t."projectId"
  FROM "Task" t WHERE a."taskId" = t."id";
UPDATE "Attachment" SET "scope" = 'TASK' WHERE "scope" IS NULL;

ALTER TABLE "Attachment" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "Attachment" ALTER COLUMN "scope" SET NOT NULL;

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. DocumentChunk (RAG store). embedding is pgvector's vector(768).
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentChunk_projectId_idx" ON "DocumentChunk"("projectId");
CREATE INDEX "DocumentChunk_attachmentId_idx" ON "DocumentChunk"("attachmentId");

ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. pgvector ANN index (hand-added; Prisma cannot generate this).
--    vector_cosine_ops matches the <=> cosine-distance operator used in retrieval.
CREATE INDEX "document_chunk_embedding_idx" ON "DocumentChunk"
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
