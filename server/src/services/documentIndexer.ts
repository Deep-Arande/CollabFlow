import { chunkText } from '../utils/chunkText';
import { embedText, aiEnabled, sleep } from './ai.service';
import { insertChunk } from './vectorStore';

// Max chunks embedded per document — bounds the worst-case burst against Gemini's
// free-tier rate limit for very large files.
const MAX_CHUNKS_PER_DOC = 30;
// Delay between sequential embedding calls to stay under the free-tier RPM limit.
const INTER_CHUNK_DELAY_MS = 1200;

// Chunk -> embed -> store an attachment's extracted text. Designed to be called
// fire-and-forget (not awaited) from the upload path so the user's upload response
// is never blocked on embedding generation. All errors are swallowed + logged.
export async function indexAttachment(
  attachmentId: string,
  projectId: string,
  extractedText: string,
): Promise<void> {
  if (!aiEnabled()) return; // no key -> skip indexing silently

  try {
    const allChunks = await chunkText(extractedText);
    const chunks = allChunks.slice(0, MAX_CHUNKS_PER_DOC);

    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i];
      try {
        const embedding = await embedText(content); // has its own 429 backoff
        await insertChunk({
          attachmentId,
          projectId,
          chunkIndex: i,
          content,
          embedding,
          tokenCount: null,
        });
      } catch (err) {
        console.error(`[indexAttachment] chunk ${i} failed for attachment ${attachmentId}:`, err);
      }
      if (i < chunks.length - 1) await sleep(INTER_CHUNK_DELAY_MS);
    }

    console.log(
      `[indexAttachment] indexed ${chunks.length}/${allChunks.length} chunks for attachment ${attachmentId}`,
    );
  } catch (err) {
    console.error(`[indexAttachment] failed for attachment ${attachmentId}:`, err);
  }
}
