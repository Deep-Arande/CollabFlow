import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

// Character-based recursive splitter. chunkSize/overlap are in CHARACTERS
// (~1800 chars ≈ the ~500-word chunks originally scoped). It prefers to break on
// paragraph -> line -> word -> hard-cut boundaries, keeping chunks semantically clean.
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1800,
  chunkOverlap: 150,
  separators: ['\n\n', '\n', ' ', ''],
});

export async function chunkText(text: string): Promise<string[]> {
  return splitter.splitText(text);
}
