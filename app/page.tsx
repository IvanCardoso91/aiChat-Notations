'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
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
} from 'lucide-react';
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
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => openConversation(conversation.id)}
              title={conversation.title}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                conversation.id === activeId
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="truncate">{conversation.title}</span>
            </button>
          ))}
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

function ChatWindow({
  id,
  initialMessages,
  onResponseFinished,
  onOpenSidebar,
}: {
  id: string;
  initialMessages: UIMessage[];
  onResponseFinished: () => void;
  onOpenSidebar: () => void;
}) {
  // No AI SDK 7 o useChat não controla mais o campo de texto: o input é
  // estado local e o envio é feito com sendMessage.
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat({
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
                {/* O react-markdown 10 não passa mais a prop `inline`: blocos de
                    código são estilizados no `pre` e código inline no `code`. */}
                <ReactMarkdown
                  components={{
                    pre({ children }) {
                      return (
                        <pre className="bg-slate-950 p-3 rounded-lg overflow-x-auto text-xs font-mono border border-slate-800 text-emerald-400 my-2 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit">
                          {children}
                        </pre>
                      );
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
          className="flex gap-2 max-w-4xl mx-auto w-full"
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Digite sua dúvida ou comando (ex: Como configurar Nginx?)..."
            className="flex-1 bg-slate-900 text-slate-100 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 placeholder-slate-500"
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
