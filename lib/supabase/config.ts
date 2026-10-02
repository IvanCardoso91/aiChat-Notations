// Configuração pública do Supabase usada pelo login.
// Aceita o nome novo da chave (PUBLISHABLE_KEY) ou o antigo (ANON_KEY).
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const supabaseAuthKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
