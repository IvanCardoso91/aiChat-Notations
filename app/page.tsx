'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import { isToolUIPart } from 'ai';
import ReactMarkdown from 'react-markdown';
import {
  Send,
  Bot,
  User,
  Terminal,
  Plus,
  MessageSquare,
  Menu,
  X,
  LogOut,
  KeyRound,
  FileText,
  Globe,
  Pencil,
  Trash2,
  Check,
  Copy,
} from 'lucide-react';
import type { ChatMessage } from '@/lib/chat-types';
import { logout } from './login/actions';

type ConversationSummary = {
  id: string;
  title: string;
  updated_at: string;
};

function newConversationId() {
  return crypto.randomUUID();
}

// Se a sessão expirou, o servidor responde 401: volta para a tela de login.
function redirectToLoginIfNeeded(response: Response) {
  if (response.status !== 401) return false;
  window.location.assign('/login');
  return true;
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  // A página sempre abre em uma conversa nova; ela só é salva no histórico
  // depois da primeira resposta.
  const [activeId, setActiveId] = useState(newConversationId);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Conversa sendo renomeada ou aguardando confirmação de exclusão.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const refreshConversations = useCallback(async () => {
    try {
      const response = await fetch('/api/conversations', { cache: 'no-store' });
      if (redirectToLoginIfNeeded(response)) return;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setConversations(await response.json());
      setHistoryError(null);
    } catch {
      setHistoryError('Não foi possível carregar o histórico.');
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  async function openConversation(id: string) {
    setSidebarOpen(false);
    if (id === activeId) return;

    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(id)}`,
        { cache: 'no-store' }
      );
      if (redirectToLoginIfNeeded(response)) return;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const conversation = await response.json();
      setInitialMessages(conversation.messages ?? []);
      setActiveId(id);
      setHistoryError(null);
    } catch {
      setHistoryError('Não foi possível abrir a conversa.');
    }
  }

  function startNewConversation() {
    setSidebarOpen(false);
    setInitialMessages([]);
    setActiveId(newConversationId());
  }

  async function renameConversation(id: string) {
    const title = editingTitle.replace(/\s+/g, ' ').trim();
    setEditingId(null);
    const current = conversations.find((conversation) => conversation.id === id);
    if (!title || title === current?.title) return;

    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        }
      );
      if (redirectToLoginIfNeeded(response)) return;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setHistoryError(null);
      await refreshConversations();
    } catch {
      setHistoryError('Não foi possível renomear a conversa.');
    }
  }

  async function deleteConversation(id: string) {
    setConfirmDeleteId(null);

    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
      if (redirectToLoginIfNeeded(response)) return;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // Se a conversa excluída é a que está aberta, volta para uma nova.
      if (id === activeId) startNewConversation();
      setHistoryError(null);
      await refreshConversations();
    } catch {
      setHistoryError('Não foi possível excluir a conversa.');
    }
  }

  return (
    <div className="flex h-dvh bg-slate-900 text-slate-100 font-sans">
      {/* Fundo escuro atrás da barra lateral no celular */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Barra lateral: histórico de conversas */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col bg-slate-950 border-r border-slate-800 transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 p-3">
          <button
            type="button"
            onClick={startNewConversation}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            <Plus className="w-4 h-4" />
            <span>Nova conversa</span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar histórico"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {historyError && (
            <p className="px-2 py-2 text-xs text-red-300">{historyError}</p>
          )}

          {conversations.length === 0 && !historyError && (
            <p className="px-2 py-2 text-xs text-slate-500">
              Nenhuma conversa salva ainda.
            </p>
          )}

          {conversations.map((conversation) => {
            // Renomeando: campo de texto no lugar do título.
            if (editingId === conversation.id) {
              return (
                <form
                  key={conversation.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    renameConversation(conversation.id);
                  }}
                  className="flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1.5"
                >
                  <input
                    autoFocus
                    value={editingTitle}
                    maxLength={60}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                    aria-label="Novo título da conversa"
                    className="min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    aria-label="Salvar título"
                    className="rounded-md p-1.5 text-emerald-400 hover:bg-slate-700"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    aria-label="Cancelar"
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </form>
              );
            }

            // Confirmando a exclusão.
            if (confirmDeleteId === conversation.id) {
              return (
                <div
                  key={conversation.id}
                  className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate text-slate-300">
                    Excluir esta conversa?
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteConversation(conversation.id)}
                    className="rounded-md bg-red-700 px-2.5 py-1 font-medium text-white hover:bg-red-600"
                  >
                    Excluir
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="rounded-md px-2 py-1 text-slate-300 hover:bg-slate-700"
                  >
                    Cancelar
                  </button>
                </div>
              );
            }

            return (
              <div
                key={conversation.id}
                className={`group flex items-center rounded-lg text-sm transition ${
                  conversation.id === activeId
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => openConversation(conversation.id)}
                  title={conversation.title}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
                >
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span className="truncate">{conversation.title}</span>
                </button>
                {/* No computador os botões aparecem ao passar o mouse; no
                    celular ficam sempre visíveis. */}
                <div className="flex shrink-0 items-center pr-1 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteId(null);
                      setEditingTitle(conversation.title);
                      setEditingId(conversation.id);
                    }}
                    aria-label={`Renomear ${conversation.title}`}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-100"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setConfirmDeleteId(conversation.id);
                    }}
                    aria-label={`Excluir ${conversation.title}`}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-red-300"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-slate-800 p-3">
          <Link
            href="/anotacoes"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-slate-200"
          >
            <FileText className="w-4 h-4" />
            <span>Anotações</span>
          </Link>
          <Link
            href="/alterar-senha"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-slate-200"
          >
            <KeyRound className="w-4 h-4" />
            <span>Alterar senha</span>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-slate-200"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          </form>
        </div>
      </aside>

      {/* A `key` recria o chat ao trocar de conversa, carregando as mensagens dela */}
      <ChatWindow
        key={activeId}
        id={activeId}
        initialMessages={initialMessages}
        onResponseFinished={refreshConversations}
        onOpenSidebar={() => setSidebarOpen(true)}
      />
    </div>
  );
}

// Bloco de código das respostas, com botão para copiar o conteúdo.
function CodeBlock({ children }: { children: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(preRef.current?.innerText ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão para a área de transferência: o texto ainda pode ser
      // selecionado e copiado à mão.
    }
  }

  return (
    <div className="relative my-2">
      <button
        type="button"
        onClick={copy}
        aria-label="Copiar código"
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/90 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 hover:text-slate-100"
      >
        {copied ? (
          <Check className="w-3 h-3 text-emerald-400" />
        ) : (
          <Copy className="w-3 h-3" />
        )}
        <span>{copied ? 'Copiado' : 'Copiar'}</span>
      </button>
      <pre
        ref={preRef}
        className="bg-slate-950 p-3 pt-9 rounded-lg overflow-x-auto text-xs font-mono border border-slate-800 text-emerald-400 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit"
      >
        {children}
      </pre>
    </div>
  );
}

function ChatWindow({
  id,
  initialMessages,
  onResponseFinished,
  onOpenSidebar,
}: {
  id: string;
  initialMessages: ChatMessage[];
  onResponseFinished: () => void;
  onOpenSidebar: () => void;
}) {
  // No AI SDK 7 o useChat não controla mais o campo de texto: o input é
  // estado local e o envio é feito com sendMessage.
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat<ChatMessage>({
    id, // enviado ao servidor, que salva a conversa com este id
    messages: initialMessages,
    // Atualiza a barra lateral quando a resposta termina (e já foi salva).
    onFinish: () => onResponseFinished(),
  });
  const isLoading = status === 'submitted' || status === 'streaming';

  // Mantém a última mensagem visível ao abrir uma conversa e durante a resposta.
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInput('');
  }

  // O campo cresce com o texto, até um limite; depois disso ganha rolagem.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [input]);

  // Enter envia; Shift+Enter quebra a linha.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 md:px-6 py-4 bg-slate-800 border-b border-slate-700 shadow-sm">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Abrir histórico"
          className="rounded-lg p-2 text-slate-300 hover:bg-slate-700 md:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Terminal className="w-6 h-6 text-emerald-400" />
        <div>
          <h1 className="font-bold text-lg text-slate-100">
            Assistente de Infraestrutura
          </h1>
          <p className="text-xs text-slate-400">
            RAG com Gemini + Supabase Vector
          </p>
        </div>
      </header>

      {/* Lista de Mensagens */}
      <section className="flex-1 overflow-y-auto p-4 space-y-4 max-w-4xl mx-auto w-full">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-center space-y-2">
            <Bot className="w-12 h-12 text-slate-600 mb-2" />
            <p className="text-lg font-medium text-slate-300">
              Como posso ajudar hoje?
            </p>
            <p className="text-sm max-w-md">
              Faça perguntas sobre suas anotações, scripts Shell/Linux, AWS,
              Docker ou problemas do dia a dia.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start gap-3 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="p-2 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/30">
                  <Bot className="w-5 h-5" />
                </div>
              )}

              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  message.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-none'
                    : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none shadow-md'
                }`}
              >
                {/* Aviso de pesquisa na internet (em andamento ou concluída) */}
                {message.role === 'assistant' &&
                  message.parts.some(isToolUIPart) && (
                    <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
                      <Globe className="w-3.5 h-3.5" />
                      <span>
                        {message.parts.some(
                          (part) =>
                            isToolUIPart(part) &&
                            part.state !== 'output-available' &&
                            part.state !== 'output-error'
                        )
                          ? 'Pesquisando na internet...'
                          : 'Consultou a internet'}
                      </span>
                    </p>
                  )}

                {/* A mensagem do usuário é mostrada como texto puro, para que um
                    log ou trecho de configuração colado mantenha as quebras de
                    linha. A resposta do assistente passa pelo Markdown; o
                    react-markdown 10 não tem mais a prop `inline`, então blocos
                    de código são estilizados no `pre` e código inline no `code`. */}
                {message.role === 'user' ? (
                  <p className="whitespace-pre-wrap break-words">
                    {message.parts
                      .map((part) => (part.type === 'text' ? part.text : ''))
                      .join('')}
                  </p>
                ) : (
                <ReactMarkdown
                  components={{
                    a({ href, children }) {
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200 break-words"
                        >
                          {children}
                        </a>
                      );
                    },
                    pre({ children }) {
                      return <CodeBlock>{children}</CodeBlock>;
                    },
                    code({ className, children }) {
                      return (
                        <code
                          className={`bg-slate-950 px-1.5 py-0.5 rounded text-emerald-300 font-mono text-xs ${className ?? ''}`}
                        >
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {message.parts
                    .map((part) => (part.type === 'text' ? part.text : ''))
                    .join('')}
                </ReactMarkdown>
                )}

                {/* Arquivos de anotações que a busca encontrou para esta resposta */}
                {message.role === 'assistant' &&
                  (message.metadata?.sources?.length ?? 0) > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-700 pt-2 text-xs text-slate-400">
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span>Anotações consultadas:</span>
                      {message.metadata?.sources?.map((source) => (
                        <span
                          key={source}
                          className="rounded-md bg-slate-900 px-2 py-0.5 text-slate-300"
                        >
                          {source}
                        </span>
                      ))}
                    </div>
                  )}
              </div>

              {message.role === 'user' && (
                <div className="p-2 bg-emerald-600 text-white rounded-lg">
                  <User className="w-5 h-5" />
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-slate-400 text-sm italic py-2">
            <Bot className="w-4 h-4 animate-spin text-emerald-400" />
            <span>Consultando anotações e pensando...</span>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-lg px-4 py-3">
            Não foi possível obter a resposta. Tente enviar novamente.
          </div>
        )}

        <div ref={bottomRef} />
      </section>

      {/* Input Form */}
      <footer className="p-4 bg-slate-800 border-t border-slate-700">
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 max-w-4xl mx-auto w-full"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua dúvida ou cole um log (Shift+Enter quebra a linha)"
            aria-label="Mensagem"
            className="flex-1 resize-none overflow-y-auto bg-slate-900 text-slate-100 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 placeholder-slate-500"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium px-5 py-3 rounded-xl transition flex items-center gap-2 text-sm"
          >
            <Send className="w-4 h-4" />
            <span>Enviar</span>
          </button>
        </form>
      </footer>
    </main>
  );
}
