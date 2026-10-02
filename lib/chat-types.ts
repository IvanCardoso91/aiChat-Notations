// Tipos compartilhados entre o servidor e a tela do chat (só tipos, sem código).
import type { UIMessage } from 'ai';

export type ChatMessageMetadata = {
  // Arquivos de anotações encontrados pela busca para esta resposta.
  sources?: string[];
};

export type ChatMessage = UIMessage<ChatMessageMetadata>;
