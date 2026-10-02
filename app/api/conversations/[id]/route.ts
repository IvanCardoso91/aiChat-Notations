import { getAuthorizedUser, unauthorizedResponse } from '@/lib/auth';
import { getConversation, isValidConversationId } from '@/lib/conversations';

// GET /api/conversations/:id — devolve uma conversa com todas as mensagens.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await getAuthorizedUser())) return unauthorizedResponse();

  const { id } = await params;

  if (!isValidConversationId(id)) {
    return Response.json({ error: 'Conversa inválida.' }, { status: 400 });
  }

  try {
    const conversation = await getConversation(id);

    if (!conversation) {
      return Response.json(
        { error: 'Conversa não encontrada.' },
        { status: 404 }
      );
    }

    return Response.json(conversation);
  } catch (error) {
    console.error('Erro ao carregar conversa:', error);
    return Response.json(
      { error: 'Não foi possível carregar a conversa.' },
      { status: 500 }
    );
  }
}
