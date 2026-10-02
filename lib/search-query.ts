// Interpreta a resposta do modelo que reescreve a pergunta para a busca.
// O modelo é instruído a devolver duas linhas: a consulta em português e a
// mesma consulta em inglês. Esta função limpa rótulos e aspas que ele possa
// acrescentar e junta as duas em um texto só. Módulo puro, sem API.

const MAX_QUERY_LENGTH = 600;

const LABEL_PATTERN =
  /^\s*(?:[-*•]\s*|\d+[.)]\s*)?(?:(?:pt(?:-br)?|en|portugu[eê]s|portuguese|ingl[eê]s|english)\s*[:\-–]\s*)?/i;

function cleanLine(line: string): string {
  return line
    .replace(LABEL_PATTERN, '')
    .replace(/^["'`“”]+|["'`“”]+$/g, '')
    .trim();
}

// Devolve a consulta bilíngue ("português / inglês") ou null se a resposta do
// modelo não for aproveitável.
export function parseBilingualQuery(modelOutput: string): string | null {
  const lines = modelOutput
    .split('\n')
    .map(cleanLine)
    .filter(Boolean)
    .slice(0, 2);

  // Remove a repetição quando as duas linhas são iguais (ex.: só um comando).
  const unique = lines.filter(
    (line, index) =>
      lines.findIndex((other) => other.toLowerCase() === line.toLowerCase()) ===
      index
  );

  const query = unique.join(' / ');
  if (!query || query.length > MAX_QUERY_LENGTH) return null;
  return query;
}
