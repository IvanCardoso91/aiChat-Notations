'use client';

import { useActionState } from 'react';
import { Terminal, LogIn } from 'lucide-react';
import { login } from './actions';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-900 px-4 text-slate-100 font-sans">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-lg"
      >
        <div className="flex items-center gap-3">
          <Terminal className="w-6 h-6 text-emerald-400" />
          <div>
            <h1 className="font-bold text-lg text-slate-100">
              Assistente de Infraestrutura
            </h1>
            <p className="text-xs text-slate-400">Entre para continuar</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm text-slate-300">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full bg-slate-900 text-slate-100 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm text-slate-300">
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full bg-slate-900 text-slate-100 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>

        {state?.error && (
          <p
            role="alert"
            className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-lg px-4 py-3"
          >
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium px-5 py-3 rounded-xl transition text-sm"
        >
          <LogIn className="w-4 h-4" />
          <span>{pending ? 'Entrando...' : 'Entrar'}</span>
        </button>
      </form>
    </main>
  );
}
