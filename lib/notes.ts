// Anotações usadas pelo RAG (tabela `document_sections`).
// Mesma lógica do scripts/ingest.ts, para uso pelo upload dentro do app.
// Usa a chave service_role: importe apenas em código de servidor.
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import mammoth from 'mammoth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const genAI = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
});

// Devem ser iguais aos do scripts/ingest.ts e aos da busca em app/api/chat.
const EMBEDDING_MODEL = 'gemini-embedding-2';
const EMBEDDING_DIMENSIONS = 768;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

// Limites de um upload, para caber no tempo de execução do servidor.
export const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_CHUNKS = 250; // cerca de 200 mil caracteres por arquivo
const EMBEDDING_CONCURRENCY = 4;
const INSERT_BATCH_SIZE = 50;

export const ALLOWED_EXTENSIONS = [
  '.txt',
  '.md',
  '.docx',
  '.sh',
  '.yaml',
  '.yml',
  '.conf',
  '.json',
  '.log',
  '.csv',
  '.ini',
  '.sql',
];

export type NoteSummary = {
  file_name: string;
  chunks: number;
  updated_at: string;
};

// Erro com mensagem que pode ser mostrada ao usuário.
export class NoteError extends Error {}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

// Arquivos de texto antigos do Windows nem sempre estão em UTF-8.
function decodeText(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

async function extractText(fileName: string, buffer: Buffer): Promise<string> {
  if (path.extname(fileName).toLowerCase() === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return decodeText(buffer);
}

async function embedChunks(
  fileName: string,
  chunks: string[]
): Promise<number[][]> {
  const embeddings: number[][] = new Array(chunks.length);
  let nextIndex = 0;

  // Alguns blocos em paralelo, para não demorar nem estourar o limite da API.
  async function worker() {
    while (nextIndex < chunks.length) {
      const index = nextIndex++;
      const response = await genAI.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: `title: ${fileName} | text: ${chunks[index]}`,
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      });
      const values = response.embeddings?.[0]?.values;
      if (!values) {
        throw new Error(`Embedding vazio para o bloco ${index + 1}.`);
      }
      embeddings[index] = values;
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(EMBEDDING_CONCURRENCY, chunks.length) },
      worker
    )
  );
  return embeddings;
}

// Nome usado para identificar a anotação: só o nome do arquivo, sem pastas.
export function normalizeFileName(name: string): string {
  return path.basename(name.replace(/\\/g, '/')).trim().slice(0, 200);
}

// Lê o arquivo, gera os vetores e grava a anotação. Se já existir uma
// anotação com o mesmo nome de arquivo, ela é substituída.
export async function ingestNote(
  rawFileName: string,
  buffer: Buffer
): Promise<{ fileName: string; chunks: number }> {
  const fileName = normalizeFileName(rawFileName);
  const extension = path.extname(fileName).toLowerCase();

  if (!fileName || !ALLOWED_EXTENSIONS.includes(extension)) {
    throw new NoteError(
      `Tipo de arquivo não aceito. Use: ${ALLOWED_EXTENSIONS.join(', ')}.`
    );
  }
  if (buffer.length > MAX_FILE_BYTES) {
    throw new NoteError('Arquivo grande demais (máximo de 4 MB).');
  }

  let text: string;
  try {
    text = (await extractText(fileName, buffer)).trim();
  } catch {
    throw new NoteError('Não foi possível ler o conteúdo do arquivo.');
  }
  if (!text) {
    throw new NoteError('O arquivo está vazio.');
  }

  const chunks = chunkText(text);
  if (chunks.length > MAX_CHUNKS) {
    throw new NoteError(
      'O arquivo tem texto demais para um único envio. Divida-o em partes menores.'
    );
  }

  // Gera todos os vetores antes de mexer no banco: se a API falhar no meio,
  // a anotação antiga continua intacta.
  const embeddings = await embedChunks(fileName, chunks);

  const { error: deleteError } = await supabase
    .from('document_sections')
    .delete()
    .eq('file_name', fileName);
  if (deleteError) throw new Error(deleteError.message);

  const rows = chunks.map((content, index) => ({
    file_name: fileName,
    content,
    embedding: embeddings[index],
  }));

  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const { error } = await supabase
      .from('document_sections')
      .insert(rows.slice(i, i + INSERT_BATCH_SIZE));
    if (error) throw new Error(error.message);
  }

  return { fileName, chunks: chunks.length };
}

// Lista as anotações (uma linha por arquivo), em ordem alfabética.
export async function listNotes(): Promise<NoteSummary[]> {
  const PAGE_SIZE = 1000;
  const notes = new Map<string, NoteSummary>();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('document_sections')
      .select('file_name, created_at')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    for (const row of data ?? []) {
      const note = notes.get(row.file_name);
      if (!note) {
        notes.set(row.file_name, {
          file_name: row.file_name,
          chunks: 1,
          updated_at: row.created_at,
        });
      } else {
        note.chunks += 1;
        if (row.created_at > note.updated_at) note.updated_at = row.created_at;
      }
    }

    if (!data || data.length < PAGE_SIZE) break;
  }

  return [...notes.values()].sort((a, b) =>
    a.file_name.localeCompare(b.file_name, 'pt-BR')
  );
}

// Remove todos os blocos de uma anotação.
export async function deleteNote(fileName: string): Promise<void> {
  const { error } = await supabase
    .from('document_sections')
    .delete()
    .eq('file_name', fileName);
  if (error) throw new Error(error.message);
}
