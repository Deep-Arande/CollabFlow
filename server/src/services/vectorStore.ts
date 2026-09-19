import { randomUUID } from 'crypto';
import { prisma } from './prisma.service';
import { embedText } from './ai.service';

// ============================================================================
// The ONLY module that touches DocumentChunk.embedding (pgvector).
//
// Prisma cannot represent the `vector` type, its operators (<=>), or its indexes,
// so every read/write of the embedding column goes through raw SQL here. Do NOT
// use prisma.documentChunk.create()/.findMany() for vector data anywhere else.
// ============================================================================

// pgvector accepts a bracketed literal like "[0.1,0.2,...]" cast to ::vector.
// Passing a JS number[] straight into a ::vector cast would be sent as a Postgres
// array and fail, so we serialize to this literal and cast the text.
const toVectorLiteral = (embedding: number[]): string => `[${embedding.join(',')}]`;

export interface RetrievedChunk {
  content: string;
  attachmentId: string;
  similarity: number;
}

// Insert one embedded chunk. embedding must be a 768-length vector.
export async function insertChunk(params: {
  attachmentId: string;
  projectId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  tokenCount?: number | null;
}): Promise<void> {
  const vec = toVectorLiteral(params.embedding);
  await prisma.$executeRaw`
    INSERT INTO "DocumentChunk"
      (id, "attachmentId", "projectId", "chunkIndex", content, embedding, "tokenCount", "createdAt")
    VALUES
      (${randomUUID()}, ${params.attachmentId}, ${params.projectId}, ${params.chunkIndex},
       ${params.content}, ${vec}::vector, ${params.tokenCount ?? null}, now())
  `;
}

// Retrieve the topK most similar chunks to `question` WITHIN a single project.
// The projectId filter is the entire access boundary — callers must pass a
// projectId the requester has already been verified an ACCEPTED member of.
export async function retrieveRelevantChunks(
  question: string,
  projectId: string,
  topK = 5,
): Promise<RetrievedChunk[]> {
  const questionEmbedding = await embedText(question);
  const vec = toVectorLiteral(questionEmbedding);

  const rows = await prisma.$queryRaw<RetrievedChunk[]>`
    SELECT content, "attachmentId", 1 - (embedding <=> ${vec}::vector) AS similarity
    FROM "DocumentChunk"
    WHERE "projectId" = ${projectId}
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${topK}
  `;
  return rows;
}
