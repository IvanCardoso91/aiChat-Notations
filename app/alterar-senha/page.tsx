'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { changePassword } from './actions';

const inputClassName =
  'w-full bg-slate-900 text-slate-100 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500';

export default function ChangePasswordPage() {
  const [state, formAction, pending] = useActionState(
    changePassword,
    undefined
  );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-900 px-4 text-slate-100 font-sans">
      <div className="w-full max-w-sm space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar ao chat</span>
        </Link>

        <form
          action={formAction}
          className="space-y-5 rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <KeyRound className="w-6 h-6 text-emerald-400" />
            <h1 className="font-bold text-lg text-slate-100">Alterar senha</h1>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="newPassword" className="text-sm text-slate-300">
              Nova senha
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className={inputClassName}
            />
            <p className="text-xs text-slate-500">Pelo menos 8 caracteres.</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="text-sm text-slate-300">
              Confirmar nova senha
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className={inputClassName}
            />
          </div>

          {state?.status === 'error' && (
            <p
              role="alert"
              className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-lg px-4 py-3"
            >
              {state.message}
            </p>
          )}

          {state?.status === 'success' && (
            <p
              role="status"
              className="text-sm text-emerald-300 bg-emerald-950/40 border border-emerald-900 rounded-lg px-4 py-3"
            >
              Senha alterada. Use a nova senha no próximo login.
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium px-5 py-3 rounded-xl transition text-sm"
          >
            <span>{pending ? 'Alterando...' : 'Alterar senha'}</span>
          </button>
        </form>
      </div>
    </main>
  );
}
