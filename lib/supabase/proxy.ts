// Usado pelo proxy.ts: renova a sessão do Supabase a cada requisição e
// barra quem não está logado antes de chegar às páginas e rotas.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedEmail } from '@/lib/allowed-emails';
import { supabaseAuthKey, supabaseUrl } from './config';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAuthKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers?: Record<string, string>) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
        // Cabeçalhos que impedem caches de guardar a resposta com a sessão.
        Object.entries(headers ?? {}).forEach(([key, value]) =>
          supabaseResponse.headers.set(key, value)
        );
      },
    },
  });

  // Não coloque código entre createServerClient e getClaims: é esta chamada
  // que valida o token e renova a sessão quando necessário.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const email = typeof claims?.email === 'string' ? claims.email : undefined;
  const authorized = Boolean(claims) && isAllowedEmail(email);

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/login';

  // Chamada diária agendada na Vercel (vercel.json): não tem usuário logado
  // e não devolve nenhum dado.
  if (pathname === '/api/keepalive') return supabaseResponse;

  if (!authorized && !isLoginPage) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  if (authorized && isLoginPage) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    const redirectResponse = NextResponse.redirect(homeUrl);
    // Mantém os cookies de sessão renovados no redirecionamento.
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return supabaseResponse;
}
