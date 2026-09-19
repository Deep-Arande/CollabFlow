import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { FileType } from '@prisma/client';

// Extract plain text from an uploaded file buffer for RAG indexing.
// PDF -> pdf-parse (v1, pure JS — no native deps), DOCX -> mammoth, IMAGE -> null (no OCR in v1).
// Never throws: extraction failure returns null so it can't break an upload.
export async function extractText(buffer: Buffer, fileType: FileType): Promise<string | null> {
  try {
    if (fileType === 'PDF') {
      const { text } = await pdfParse(buffer);
      const trimmed = text?.trim();
      return trimmed ? trimmed : null;
    }

    if (fileType === 'DOCX') {
      const { value } = await mammoth.extractRawText({ buffer });
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    }

    return null; // IMAGE (or anything else) — skipped in v1
  } catch (err) {
    console.error(`[extractText] extraction failed for ${fileType}:`, err);
    return null;
  }
}
