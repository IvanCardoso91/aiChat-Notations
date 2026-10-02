import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import {
  generateText,
  streamText,
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  jsonSchema,
  tool,
  toUIMessageStream,
  wrapLanguageModel,
  type LanguageModelMiddleware,
} from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { getAuthorizedUser, unauthorizedResponse } from '@/lib/auth';
import type { ChatMessage } from '@/lib/chat-types';
import { isValidConversationId, saveConversation } from '@/lib/conversations';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });

// Modelo principal do chat e modelo reserva, usado quando o principal falha
// (por exemplo, no erro "This model is currently experiencing high demand").
const PRIMARY_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.5-flash-lite';

// Se a chamada ao modelo principal falhar antes de a resposta começar,
// a mesma pergunta é enviada imediatamente ao modelo reserva.
const fallbackMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v4',
  wrapStream: async ({ doStream, params }) => {
    try {
      return await doStream();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `⚠️ ${PRIMARY_MODEL} falhou (${reason}). Usando o modelo reserva ${FALLBACK_MODEL}.`
      );
      return await google(FALLBACK_MODEL).doStream(params);
    }
  },
};

// Instruções extras quando a pesquisa na internet está disponível.
function webSearchInstructions() {
  const today = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());

  return `

Pesquisa na internet (data de hoje: ${today}):
- Use a ferramenta pesquisar_na_internet quando o usuário pedir informações atuais (versões, alternativas mais modernas, novidades) ou quando as anotações e o seu conhecimento puderem estar desatualizados.
- Não pesquise quando as anotações já respondem bem à pergunta.
- Ao usar a pesquisa, deixe claro o que veio das anotações e o que veio da internet, e liste as fontes no final como links em Markdown.
- Nunca coloque na consulta dados das anotações como senhas, IPs, nomes de clientes ou de servidores.`;
}

const chatModel = wrapLanguageModel({
  model: google(PRIMARY_MODEL),
  middleware: fallbackMiddleware,
});

// Pesquisa na internet (opcional): só é oferecida ao modelo quando a chave
// TAVILY_API_KEY está configurada.
const tavilyApiKey = process.env.TAVILY_API_KEY;

type WebSearchResult = { title?: string; url?: string; content?: string };

const webSearchTool = tool({
  description:
    'Pesquisa na internet informações públicas e atuais (versões, alternativas ' +
    'mais modernas, novidades, documentação). A consulta deve ser genérica: ' +
    'nunca inclua senhas, IPs, nomes de clientes ou de servidores das anotações.',
  inputSchema: jsonSchema<{ query: string }>({
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'O que pesquisar, em poucas palavras.',
      },
    },
    required: ['query'],
  }),
  // Em caso de falha devolve um aviso em vez de lançar erro, para o modelo
  // ainda conseguir responder com o que tem.
  execute: async ({ query }) => {
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tavilyApiKey}`,
        },
        body: JSON.stringify({ query, search_depth: 'basic', max_results: 5 }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.error('Erro na pesquisa (Tavily): HTTP', response.status);
        return { error: 'A pesquisa na internet falhou.' };
      }

      const data: { results?: WebSearchResult[] } = await response.json();
      return {
        results: (data.results ?? []).map(({ title, url, content }) => ({
          title,
          url,
          content,
        })),
      };
    } catch (error) {
      console.error('Erro na pesquisa (Tavily):', error);
      return { error: 'A pesquisa na internet falhou.' };
    }
  },
});

function messageText(message: ChatMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
}

// Em uma conversa em andamento, a pergunta pode depender do que veio antes
// ("e no Ubuntu?"). Antes de buscar nas anotações, pede ao modelo leve que a
// reescreva como uma consulta completa. Se algo falhar, usa a pergunta original.
async function buildSearchQuery(
  previousMessages: ChatMessage[],
  question: string
): Promise<string> {
  const history = previousMessages
    .slice(-6)
    .map((message) => {
      const text = messageText(message).slice(0, 400);
      if (!text) return '';
      return `${message.role === 'user' ? 'Usuário' : 'Assistente'}: ${text}`;
    })
    .filter(Boolean)
    .join('\n');

  // Primeira pergunta da conversa, ou pergunta longa (um log colado, por
  // exemplo): já é independente.
  if (!history || question.length > 400) return question;

  try {
    const { text } = await generateText({
      model: google(FALLBACK_MODEL),
      instructions:
        'Você prepara consultas de busca. Reescreva a última pergunta do usuário ' +
        'como uma consulta independente, em português, incluindo o assunto da ' +
        'conversa quando a pergunta depender dele. Mantenha nomes de servidores, ' +
        'comandos e códigos de erro exatamente como foram escritos. Se a pergunta ' +
        'já for independente, repita-a. Responda apenas com a consulta, em uma linha.',
      prompt: `Conversa:\n${history}\n\nÚltima pergunta: ${question}`,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(4000),
    });

    const rewritten = text.trim().split('\n')[0].replace(/^["'`]+|["'`]+$/g, '');
    if (rewritten && rewritten.length <= 300) return rewritten;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`Não foi possível reescrever a pergunta para a busca: ${reason}`);
  }
  return question;
}

type NoteMatch = { file_name: string; content: string };

// Busca os trechos das anotações para a pergunta. Usa a busca híbrida
// (significado + termos exatos) e, se a função ainda não existir no banco,
// volta para a busca só por significado.
async function searchNotes(
  queryText: string,
  queryEmbedding: number[]
): Promise<NoteMatch[]> {
  const hybrid = await supabase.rpc('hybrid_search_document_sections', {
    query_text: queryText,
    query_embedding: queryEmbedding,
    match_count: 6, // até 6 trechos
    match_threshold: 0.3, // limiar de similaridade da busca por significado
  });
  if (!hybrid.error) return hybrid.data ?? [];

  console.warn(
    'Busca híbrida indisponível, usando só a busca por significado:',
    hybrid.error.message
  );
  const semantic = await supabase.rpc('match_document_sections', {
    query_embedding: queryEmbedding,
    match_threshold: 0.3,
    match_count: 4,
  });
  if (semantic.error) {
    // Sem este log, uma falha na busca passaria despercebida e o assistente
    // responderia sem consultar as anotações.
    console.error('Erro na busca do Supabase:', semantic.error.message);
    return [];
  }
  return semantic.data ?? [];
}

export async function POST(req: Request) {
  // Só o usuário logado e autorizado pode usar o chat.
  const user = await getAuthorizedUser();
  if (!user) return unauthorizedResponse();

  try {
    // O useChat envia as mensagens e o id da conversa atual.
    const { messages, id }: { messages: ChatMessage[]; id?: string } =
      await req.json();

    // No AI SDK 7 as mensagens não têm mais `content`: o texto fica em `parts`.
    const lastUserIndex = messages.findLastIndex(
      (message) => message.role === 'user'
    );
    const question =
      lastUserIndex >= 0 ? messageText(messages[lastUserIndex]) : '';

    let context = '';
    // Arquivos de anotações encontrados, para mostrar abaixo da resposta.
    let sources: string[] = [];

    if (question) {
      // 1. Montar a consulta de busca levando em conta a conversa
      const searchQuery = await buildSearchQuery(
        messages.slice(0, lastUserIndex),
        question
      );

      // 2. Gerar o embedding da consulta (usando a mesma dimensão 768)
      const embeddingResponse = await genAI.models.embedContent({
        model: 'gemini-embedding-2',
        contents: `task: search result | query: ${searchQuery}`,
        config: { outputDimensionality: 768 },
      });

      const queryEmbedding = embeddingResponse.embeddings?.[0]?.values;

      // 3. Buscar no Supabase os trechos das anotações
      if (queryEmbedding) {
        const documents = await searchNotes(searchQuery, queryEmbedding);

        sources = [...new Set(documents.map((doc) => doc.file_name))];
        context = documents
          .map(
            (doc) =>
              `--- Início do arquivo (${doc.file_name}) ---\n${doc.content}\n--- Fim do arquivo ---`
          )
          .join('\n\n');
      }
    }

    // 4. Montar o Prompt do Sistema combinando o contexto recuperado
    const systemPrompt = `Você é um assistente virtual especialista em Engenharia de Infraestrutura (Unix, Linux, Cloud).
Você deve ajudar o usuário a responder dúvidas, analisar logs, criar scripts e resolver problemas técnicos.

Abaixo estão trechos relevantes das anotações pessoais do usuário recuperadas do banco de dados:

${context ? context : 'Nenhuma anotação diretamente relacionada foi encontrada.'}

Instruções:
- Use as anotações acima prioritariamente para fundamentar sua resposta caso sejam relevantes.
- Se a pergunta envolver códigos Shell/Unix, comandos, Docker ou configurações Cloud, utilize blocos de código formatados com syntax highlighting.
- Seja claro, objetivo e prestativo.${tavilyApiKey ? webSearchInstructions() : ''}`;

    // 5. Chamar o modelo Gemini com respostas em tempo real (Stream)
    // Das mensagens anteriores, o modelo recebe só o texto: os resultados de
    // pesquisas antigas ficam salvos no histórico, mas não são reenviados.
    const textOnlyMessages = messages
      .map((message) => ({
        ...message,
        parts: message.parts.filter((part) => part.type === 'text'),
      }))
      .filter((message) => message.parts.length > 0);

    const result = streamText({
      model: chatModel,
      instructions: systemPrompt,
      messages: await convertToModelMessages(textOnlyMessages),
      tools: tavilyApiKey ? { pesquisar_na_internet: webSearchTool } : undefined,
      // Permite pesquisar e depois responder, com no máximo 4 passos.
      stopWhen: isStepCount(4),
    });

    // Mantém a geração até o fim mesmo que a aba seja fechada no meio da
    // resposta, para que a conversa seja salva completa.
    result.consumeStream();

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
        // Envia junto com a resposta os arquivos consultados; eles ficam
        // salvos no histórico como parte da mensagem.
        messageMetadata: ({ part }) =>
          part.type === 'start' && sources.length > 0 ? { sources } : undefined,
        // 6. Salvar a conversa (pergunta + resposta) no histórico
        onEnd: async ({ messages: allMessages, responseMessage }) => {
          const answered = responseMessage.parts.some(
            (part) => part.type === 'text' && part.text.trim() !== ''
          );
          // Não salva quando a resposta falhou ou veio vazia.
          if (!answered || !isValidConversationId(id)) return;

          try {
            await saveConversation(id, user.id, allMessages);
          } catch (error) {
            console.error('Erro ao salvar a conversa:', error);
          }
        },
        onError: (error) => {
          console.error('Erro no stream do chat:', error);
          return 'Ocorreu um erro ao gerar a resposta.';
        },
      }),
    });
  } catch (error) {
    console.error('Erro na API de Chat:', error);
    return Response.json(
      { error: 'Não foi possível processar a mensagem.' },
      { status: 500 }
    );
  }
}
