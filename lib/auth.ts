// Verificação de login para código de servidor (rotas em app/api).
import { isAllowedEmail } from '@/lib/allowed-emails';
import { createClient } from '@/lib/supabase/server';

// Devolve o usuário logado e autorizado, ou null.
// getUser() confirma a sessão direto no Supabase, então uma sessão encerrada
// ou revogada deixa de valer imediatamente.
export async function getAuthorizedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAllowedEmail(user.email)) return null;
  return user;
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Não autenticado.' }, { status: 401 });
}
