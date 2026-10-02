import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

// No Next.js 16 o antigo middleware.ts se chama proxy.ts.
// Roda antes de cada requisição: renova a sessão e exige login.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Tudo, exceto arquivos estáticos e imagens.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
