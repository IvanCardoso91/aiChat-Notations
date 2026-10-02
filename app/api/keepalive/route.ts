import { createClient } from '@supabase/supabase-js';

// GET /api/keepalive — chamada uma vez por dia pelo agendamento da Vercel
// (vercel.json). Faz uma consulta mínima ao banco para que o projeto gratuito
// do Supabase não seja pausado por falta de uso. Não devolve nenhum dado.
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from('document_sections')
    .select('id')
    .limit(1);

  if (error) {
    console.error('Erro no keepalive:', error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true });
}
