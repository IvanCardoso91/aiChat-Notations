import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';
import dotenv from 'dotenv';

// Carrega as variáveis do .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;

if (!supabaseUrl || !supabaseKey || !geminiApiKey) {
  console.error(
    '❌ Erro: Verifique se as variáveis de ambiente estão preenchidas no .env.local'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

// Modelo de embedding. O 'text-embedding-004' foi desligado pelo Google em
// 14/01/2026; o substituto recomendado é o 'gemini-embedding-2'.
const EMBEDDING_MODEL = 'gemini-embedding-2';

// O modelo novo gera 3072 dimensões por padrão. Mantemos 768 (o mesmo tamanho
// do text-embedding-004) para bater com a coluna vector(768) do Supabase.
// Se a sua coluna tiver outro tamanho, ajuste este valor.
const EMBEDDING_DIMENSIONS = 768;

// Função para quebrar textos longos em pedaços menores (chunks) de ~1000 caracteres
function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

// Extrai texto dependendo da extensão do arquivo
async function extractTextFromFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  // Para .txt, .md, .sh, .yaml, .conf, .json, etc.
  return fs.readFileSync(filePath, 'utf-8');
}

async function runIngestion() {
  const notasDir = path.join(process.cwd(), 'scripts', 'notas');

  if (!fs.existsSync(notasDir)) {
    fs.mkdirSync(notasDir, { recursive: true });
    console.log(
      '📁 Pasta scripts/notas criada! Coloque seus arquivos lá dentro e rode novamente.'
    );
    return;
  }

  const files = fs.readdirSync(notasDir);

  if (files.length === 0) {
    console.log(
      '⚠️ NENHUM ARQUIVO ENCONTRADO em scripts/notas. Adicione alguns arquivos e execute o script.'
    );
    return;
  }

  console.log(`🚀 Iniciando ingestão de ${files.length} arquivo(s)...`);

  let falhas = 0;

  for (const file of files) {
    const filePath = path.join(notasDir, file);
    if (fs.statSync(filePath).isDirectory()) continue;

    console.log(`\n📄 Processando: ${file}`);
    const rawText = await extractTextFromFile(filePath);

    if (!rawText.trim()) {
      console.log(`⚠️ Arquivo ${file} está vazio, pulando...`);
      continue;
    }

    const chunks = chunkText(rawText);
    console.log(`🧩 Gerado(s) ${chunks.length} bloco(s) de texto.`);

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];

      try {
        // Gerar embedding usando o novo SDK @google/genai
        // O gemini-embedding-2 não usa taskType: a instrução vai no próprio
        // texto. Este é o formato recomendado para documentos a indexar.
        // (Na busca, a pergunta deve ir como `task: search result | query: ...`)
        const response = await ai.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: `title: ${file} | text: ${chunk}`,
          config: { outputDimensionality: EMBEDDING_DIMENSIONS },
        });

        const embedding = response.embeddings?.[0]?.values;

        if (!embedding) {
          falhas++;
          console.error(
            `❌ Falha ao gerar embedding para o bloco ${index + 1} de ${file}`
          );
          continue;
        }

        // Salvar no Supabase
        const { error } = await supabase.from('document_sections').insert({
          file_name: file,
          content: chunk,
          embedding: embedding,
        });

        if (error) {
          falhas++;
          console.error(
            `❌ Erro ao salvar bloco ${index + 1} no Supabase:`,
            error.message
          );
        } else {
          console.log(
            `✅ Bloco ${index + 1}/${chunks.length} salvo com sucesso no banco.`
          );
        }
      } catch (err: unknown) {
        falhas++;
        console.error(
          `❌ Erro na API do Gemini/Supabase no bloco ${index + 1}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  if (falhas > 0) {
    console.error(`\n⚠️ Ingestão finalizada com ${falhas} bloco(s) com erro.`);
    process.exitCode = 1;
  } else {
    console.log('\n🎉 Ingestão concluída com sucesso!');
  }
}

runIngestion();
