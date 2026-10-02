'use server';

import { redirect } from 'next/navigation';
import {
  hasAllowedEmailsConfigured,
  isAllowedEmail,
} from '@/lib/allowed-emails';
import { createClient } from '@/lib/supabase/server';

export type LoginState = { error: string } | undefined;

export async function login(
  _previousState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Informe o e-mail e a senha.' };
  }

  if (!hasAllowedEmailsConfigured()) {
    console.error(
      'ALLOWED_EMAILS não está configurado: nenhum usuário pode entrar.'
    );
    return { error: 'O acesso ainda não foi configurado no servidor.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: 'E-mail ou senha incorretos.' };
  }

  if (!isAllowedEmail(data.user.email)) {
    await supabase.auth.signOut();
    return { error: 'Este usuário não tem acesso ao assistente.' };
  }

  redirect('/');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
