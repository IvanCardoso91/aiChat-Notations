import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import {
  streamText,
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  toUIMessageStream,
  wrapLanguageModel,
  type LanguageModelMiddleware,
  type UIMessage,
} from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { getAuthorizedUser, unauthorizedResponse } from '@/lib/auth';
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

const chatModel = wrapLanguageModel({
  model: google(PRIMARY_MODEL),
  middleware: fallbackMiddleware,
});

export async function POST(req: Request) {
  // Só o usuário logado e autorizado pode usar o chat.
  const user = await getAuthorizedUser();
  if (!user) return unauthorizedResponse();

  try {
    // O useChat envia as mensagens e o id da conversa atual.
    const { messages, id }: { messages: UIMessage[]; id?: string } =
      await req.json();

    // No AI SDK 7 as mensagens não têm mais `content`: o texto fica em `parts`.
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'user');
    const question = (lastUserMessage?.parts ?? [])
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('')
      .trim();

    let context = '';

    if (question) {
      // 1. Gerar o embedding da pergunta do usuário (usando a mesma dimensão 768)
      const embeddingResponse = await genAI.models.embedContent({
        model: 'gemini-embedding-2',
        contents: `task: search result | query: ${question}`,
        config: { outputDimensionality: 768 },
      });

      const queryEmbedding = embeddingResponse.embeddings?.[0]?.values;

      // 2. Buscar no Supabase as seções de notas mais semelhantes
      if (queryEmbedding) {
        const { data: documents, error } = await supabase.rpc(
          'match_document_sections',
          {
            query_embedding: queryEmbedding,
            match_threshold: 0.3, // Limiar de similaridade
            match_count: 4, // Pega até 4 trechos mais relevantes
          }
        );

        if (error) {
          // Sem este log, uma falha na busca passaria despercebida e o
          // assistente responderia sem consultar as anotações.
          console.error('Erro na busca do Supabase:', error.message);
        } else if (documents && documents.length > 0) {
          context = documents
            .map(
              (doc: any) =>
                `--- Início do arquivo (${doc.file_name}) ---\n${doc.content}\n--- Fim do arquivo ---`
            )
            .join('\n\n');
        }
      }
    }

    // 3. Montar o Prompt do Sistema combinando o contexto recuperado
    const systemPrompt = `Você é um assistente virtual especialista em Engenharia de Infraestrutura (Unix, Linux, Cloud).
Você deve ajudar o usuário a responder dúvidas, analisar logs, criar scripts e resolver problemas técnicos.

Abaixo estão trechos relevantes das anotações pessoais do usuário recuperadas do banco de dados:

${context ? context : 'Nenhuma anotação diretamente relacionada foi encontrada.'}

Instruções:
- Use as anotações acima prioritariamente para fundamentar sua resposta caso sejam relevantes.
- Se a pergunta envolver códigos Shell/Unix, comandos, Docker ou configurações Cloud, utilize blocos de código formatados com syntax highlighting.
- Seja claro, objetivo e prestativo.`;

    // 4. Chamar o modelo Gemini com respostas em tempo real (Stream)
    const result = streamText({
      model: chatModel,
      instructions: systemPrompt,
      messages: await convertToModelMessages(messages),
    });

    // Mantém a geração até o fim mesmo que a aba seja fechada no meio da
    // resposta, para que a conversa seja salva completa.
    result.consumeStream();

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
        // 5. Salvar a conversa (pergunta + resposta) no histórico
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
  } catch (error: any) {
    console.error('Erro na API de Chat:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
}
