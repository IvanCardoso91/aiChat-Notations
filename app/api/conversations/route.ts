import { getAuthorizedUser, unauthorizedResponse } from '@/lib/auth';
import { listConversations } from '@/lib/conversations';

// GET /api/conversations — lista as conversas do usuário logado.
export async function GET() {
  const user = await getAuthorizedUser();
  if (!user) return unauthorizedResponse();

  try {
    return Response.json(await listConversations(user.id));
  } catch (error) {
    console.error('Erro ao listar conversas:', error);
    return Response.json(
      { error: 'Não foi possível listar as conversas.' },
      { status: 500 }
    );
  }
}
