// Divide o texto de uma anotação em blocos para a busca.
// Em vez de cortar a cada N caracteres, respeita a estrutura do texto:
// parágrafos, títulos e blocos de código ficam inteiros sempre que cabem.
// Módulo puro (sem banco nem API), usado pelo upload e pelo scripts/ingest.ts.

export const CHUNK_SIZE = 1000; // tamanho máximo de um bloco, em caracteres
export const CHUNK_OVERLAP = 150; // quanto do bloco anterior é repetido no início do próximo
const HEADING_BREAK_MIN = 300; // um título só abre bloco novo se o atual já tiver este tamanho

const HEADING_PATTERN = /^#{1,6}\s/;
const FENCE_PATTERN = /^\s*(```|~~~)/;

// Separa o texto em parágrafos (trechos entre linhas em branco), sem quebrar
// dentro de blocos de código cercados por ``` ou ~~~.
function splitParagraphs(text: string): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let insideFence = false;

  const flush = () => {
    const paragraph = current.join('\n').trim();
    if (paragraph) paragraphs.push(paragraph);
    current = [];
  };

  for (const line of text.split('\n')) {
    if (FENCE_PATTERN.test(line)) insideFence = !insideFence;

    if (!insideFence && line.trim() === '') {
      flush();
    } else if (!insideFence && HEADING_PATTERN.test(line)) {
      // Um título sempre começa um parágrafo novo.
      flush();
      current.push(line);
    } else {
      current.push(line);
    }
  }
  flush();
  return paragraphs;
}

// Corta um trecho grande demais: primeiro por linha, depois por frase e,
// em último caso, no limite de caracteres.
function splitOversized(piece: string): string[] {
  if (piece.length <= CHUNK_SIZE) return [piece];

  const byLine = piece.split('\n').filter((line) => line.trim() !== '');
  if (byLine.length > 1) return packPieces(byLine.flatMap(splitOversized), '\n');

  const bySentence = piece.split(/(?<=[.!?;:])\s+/);
  if (bySentence.length > 1) {
    return packPieces(bySentence.flatMap(splitOversized), ' ');
  }

  const slices: string[] = [];
  for (let i = 0; i < piece.length; i += CHUNK_SIZE) {
    slices.push(piece.slice(i, i + CHUNK_SIZE));
  }
  return slices;
}

// Junta trechos pequenos em sequência enquanto couberem em CHUNK_SIZE.
function packPieces(pieces: string[], separator: string): string[] {
  const packed: string[] = [];
  let current = '';

  for (const piece of pieces) {
    if (current && current.length + separator.length + piece.length > CHUNK_SIZE) {
      packed.push(current);
      current = piece;
    } else {
      current = current ? current + separator + piece : piece;
    }
  }
  if (current) packed.push(current);
  return packed;
}

// Final do bloco anterior que será repetido no início do próximo, cortado em
// um limite de linha para não começar no meio de um comando.
function overlapTail(chunk: string): string {
  if (chunk.length <= CHUNK_OVERLAP) return '';
  const tail = chunk.slice(-CHUNK_OVERLAP);
  const lineBreak = tail.indexOf('\n');
  return lineBreak === -1 ? '' : tail.slice(lineBreak + 1).trim();
}

export function chunkText(text: string): string[] {
  const pieces = splitParagraphs(text.replace(/\r\n?/g, '\n')).flatMap(
    splitOversized
  );

  const chunks: string[] = [];
  let current = '';

  for (const piece of pieces) {
    const startsSection =
      HEADING_PATTERN.test(piece) && current.length >= HEADING_BREAK_MIN;
    const fits = current.length + 2 + piece.length <= CHUNK_SIZE;

    if (current && (startsSection || !fits)) {
      chunks.push(current);
      // Um título novo começa limpo; nos outros casos, repete o final do
      // bloco anterior para manter o contexto.
      const tail = startsSection ? '' : overlapTail(current);
      current =
        tail && tail.length + 2 + piece.length <= CHUNK_SIZE
          ? `${tail}\n\n${piece}`
          : piece;
    } else {
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}
