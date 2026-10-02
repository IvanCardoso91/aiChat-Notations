import { getAuthorizedUser, unauthorizedResponse } from '@/lib/auth';
import { listConversations } from '@/lib/conversations';

// GET /api/conversations — lista as conversas salvas (para a barra lateral).
export async function GET() {
  if (!(await getAuthorizedUser())) return unauthorizedResponse();

  try {
    return Response.json(await listConversations());
  } catch (error) {
    console.error('Erro ao listar conversas:', error);
    return Response.json(
      { error: 'Não foi possível listar as conversas.' },
      { status: 500 }
    );
  }
}
