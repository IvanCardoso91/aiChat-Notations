'use server';

import { getAuthorizedUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const MIN_PASSWORD_LENGTH = 8;

export type ChangePasswordState =
  | { status: 'error'; message: string }
  | { status: 'success' }
  | undefined;

export async function changePassword(
  _previousState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  // Só quem está logado e autorizado pode trocar a própria senha.
  // A senha atual não é pedida: basta estar com a sessão aberta.
  const user = await getAuthorizedUser();
  if (!user) {
    return { status: 'error', message: 'Sua sessão expirou. Entre novamente.' };
  }

  if (!newPassword || !confirmPassword) {
    return { status: 'error', message: 'Preencha todos os campos.' };
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      status: 'error',
      message: `A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      status: 'error',
      message: 'A confirmação não é igual à nova senha.',
    };
  }

  const supabase = await createClient();

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    console.error('Erro ao alterar a senha:', updateError.message);
    const messages: Record<string, string> = {
      same_password: 'A nova senha deve ser diferente da atual.',
      weak_password: 'A nova senha é fraca demais. Escolha uma senha mais forte.',
    };
    return {
      status: 'error',
      message:
        messages[updateError.code ?? ''] ??
        'Não foi possível alterar a senha. Tente novamente.',
    };
  }

  return { status: 'success' };
}
