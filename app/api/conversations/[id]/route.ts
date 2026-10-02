import { getAuthorizedUser, unauthorizedResponse } from '@/lib/auth';
import {
  TITLE_MAX_LENGTH,
  deleteConversation,
  getConversation,
  isValidConversationId,
  renameConversation,
} from '@/lib/conversations';

type RouteParams = { params: Promise<{ id: string }> };

const invalidId = () =>
  Response.json({ error: 'Conversa inválida.' }, { status: 400 });
const notFound = () =>
  Response.json({ error: 'Conversa não encontrada.' }, { status: 404 });

// GET /api/conversations/:id — devolve uma conversa do usuário logado.
export async function GET(_req: Request, { params }: RouteParams) {
  const user = await getAuthorizedUser();
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  if (!isValidConversationId(id)) return invalidId();

  try {
    const conversation = await getConversation(id, user.id);
    return conversation ? Response.json(conversation) : notFound();
  } catch (error) {
    console.error('Erro ao carregar conversa:', error);
    return Response.json(
      { error: 'Não foi possível carregar a conversa.' },
      { status: 500 }
    );
  }
}

// PATCH /api/conversations/:id — renomeia a conversa. Corpo: { "title": "..." }
export async function PATCH(req: Request, { params }: RouteParams) {
  const user = await getAuthorizedUser();
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  if (!isValidConversationId(id)) return invalidId();

  try {
    const body: unknown = await req.json().catch(() => null);
    const rawTitle =
      body && typeof body === 'object' && 'title' in body ? body.title : null;
    const title =
      typeof rawTitle === 'string'
        ? rawTitle.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX_LENGTH)
        : '';

    if (!title) {
      return Response.json({ error: 'Informe um título.' }, { status: 400 });
    }

    const renamed = await renameConversation(id, user.id, title);
    return renamed ? Response.json({ id, title }) : notFound();
  } catch (error) {
    console.error('Erro ao renomear conversa:', error);
    return Response.json(
      { error: 'Não foi possível renomear a conversa.' },
      { status: 500 }
    );
  }
}

// DELETE /api/conversations/:id — exclui a conversa.
export async function DELETE(_req: Request, { params }: RouteParams) {
  const user = await getAuthorizedUser();
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  if (!isValidConversationId(id)) return invalidId();

  try {
    const deleted = await deleteConversation(id, user.id);
    return deleted ? Response.json({ ok: true }) : notFound();
  } catch (error) {
    console.error('Erro ao excluir conversa:', error);
    return Response.json(
      { error: 'Não foi possível excluir a conversa.' },
      { status: 500 }
    );
  }
}
