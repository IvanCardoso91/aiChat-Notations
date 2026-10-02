// Lista de e-mails autorizados a usar o assistente, definida na variável de
// ambiente ALLOWED_EMAILS (separados por vírgula). Sem essa variável, ninguém
// entra: assim uma conta criada por engano no Supabase não ganha acesso.
function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function hasAllowedEmailsConfigured(): boolean {
  return allowedEmails().length > 0;
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().includes(email.trim().toLowerCase());
}
