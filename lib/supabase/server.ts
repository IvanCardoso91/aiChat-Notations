// Cliente do Supabase para código de servidor (rotas e Server Actions).
// Lê e grava a sessão do usuário nos cookies da requisição.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAuthKey, supabaseUrl } from './config';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAuthKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Chamado a partir de um Server Component, onde cookies não podem
          // ser gravados. Pode ser ignorado: o proxy.ts renova a sessão.
        }
      },
    },
  });
}
