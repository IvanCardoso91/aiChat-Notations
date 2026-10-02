// Histórico de conversas no Supabase (tabela `conversations`).
// Este arquivo usa a chave service_role: importe-o apenas em código de
// servidor (rotas em app/api), nunca em componentes 'use client'.
import { createClient } from '@supabase/supabase-js';
import type { UIMessage } from 'ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TITLE_MAX_LENGTH = 60;

export type ConversationSummary = {
  id: string;
  title: string;
  updated_at: string;
};

export type Conversation = ConversationSummary & {
  messages: UIMessage[];
};

function messageText(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
}

// O título da conversa é o começo da primeira pergunta do usuário.
function buildTitle(messages: UIMessage[]): string {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  const text = firstUserMessage
    ? messageText(firstUserMessage).replace(/\s+/g, ' ')
    : '';
  if (!text) return 'Nova conversa';
  return text.length > TITLE_MAX_LENGTH
    ? `${text.slice(0, TITLE_MAX_LENGTH)}…`
    : text;
}

export function isValidConversationId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

// Lista as conversas do usuário, da mais recente para a mais antiga
// (sem as mensagens).
export async function listConversations(
  userId: string
): Promise<ConversationSummary[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return data ?? [];
}

// Carrega uma conversa do usuário com todas as mensagens, ou null se ela não
// existir ou pertencer a outra pessoa.
export async function getConversation(
  id: string,
  userId: string
): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, updated_at, messages')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

// Cria a conversa ou substitui as mensagens de uma conversa do usuário.
export async function saveConversation(
  id: string,
  userId: string,
  messages: UIMessage[]
): Promise<void> {
  // Nunca sobrescreve uma conversa que pertence a outro usuário.
  const { data: existing, error: lookupError } = await supabase
    .from('conversations')
    .select('user_id')
    .eq('id', id)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);
  if (existing && existing.user_id !== userId) {
    throw new Error('A conversa pertence a outro usuário.');
  }

  const { error } = await supabase.from('conversations').upsert({
    id,
    user_id: userId,
    title: buildTitle(messages),
    messages,
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
}
