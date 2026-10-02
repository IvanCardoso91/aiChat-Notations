'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Trash2, Upload } from 'lucide-react';

type NoteSummary = {
  file_name: string;
  chunks: number;
  updated_at: string;
};

type UploadResult = {
  fileName: string;
  ok: boolean;
  message: string;
};

const ACCEPTED_EXTENSIONS =
  '.txt,.md,.docx,.sh,.yaml,.yml,.conf,.json,.log,.csv,.ini,.sql';

// Se a sessão expirou, o servidor responde 401: volta para a tela de login.
function redirectToLoginIfNeeded(response: Response) {
  if (response.status !== 401) return false;
  window.location.assign('/login');
  return true;
}

async function errorMessage(response: Response, fallback: string) {
  try {
    const body = await response.json();
    return typeof body?.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function NotesPage() {
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshNotes = useCallback(async () => {
    try {
      const response = await fetch('/api/notes', { cache: 'no-store' });
      if (redirectToLoginIfNeeded(response)) return;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setNotes(await response.json());
      setListError(null);
    } catch {
      setListError('Não foi possível carregar as anotações.');
    }
  }, []);

  useEffect(() => {
    refreshNotes();
  }, [refreshNotes]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const files: File[] = Array.from(fileInputRef.current?.files ?? []);
    if (files.length === 0 || uploading) return;

    setResults([]);
    const uploadResults: UploadResult[] = [];

    // Um arquivo por vez, para não sobrecarregar o servidor.
    for (const [index, file] of files.entries()) {
      setUploading(`Enviando ${index + 1} de ${files.length}: ${file.name}`);
      try {
        const body = new FormData();
        body.append('file', file);
        const response = await fetch('/api/notes', { method: 'POST', body });
        if (redirectToLoginIfNeeded(response)) return;

        if (response.ok) {
          const saved = await response.json();
          uploadResults.push({
            fileName: file.name,
            ok: true,
            message: `Adicionada (${saved.chunks} bloco(s)).`,
          });
        } else {
          uploadResults.push({
            fileName: file.name,
            ok: false,
            message: await errorMessage(response, 'Falha no envio.'),
          });
        }
      } catch {
        uploadResults.push({
          fileName: file.name,
          ok: false,
          message: 'Falha de conexão durante o envio.',
        });
      }
      setResults([...uploadResults]);
    }

    setUploading(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    await refreshNotes();
  }

  async function handleDelete(fileName: string) {
    setDeleting(fileName);
    try {
      const response = await fetch(
        `/api/notes?name=${encodeURIComponent(fileName)}`,
        { method: 'DELETE' }
      );
      if (redirectToLoginIfNeeded(response)) return;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setListError(null);
      await refreshNotes();
    } catch {
      setListError(`Não foi possível excluir "${fileName}".`);
    } finally {
      setDeleting(null);
      setConfirmingDelete(null);
    }
  }

  return (
    <main className="min-h-dvh bg-slate-900 px-4 py-6 text-slate-100 font-sans">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar ao chat</span>
        </Link>

        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-emerald-400" />
          <div>
            <h1 className="font-bold text-lg text-slate-100">Anotações</h1>
            <p className="text-xs text-slate-400">
              Arquivos que o assistente consulta para responder.
            </p>
          </div>
        </div>

        {/* Envio de novos arquivos */}
        <form
          onSubmit={handleUpload}
          className="space-y-4 rounded-2xl border border-slate-700 bg-slate-800 p-5"
        >
          <div className="space-y-1.5">
            <label htmlFor="files" className="text-sm text-slate-300">
              Adicionar arquivos
            </label>
            <input
              id="files"
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS}
              disabled={uploading !== null}
              className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-sm file:text-slate-100 hover:file:bg-slate-600"
            />
            <p className="text-xs text-slate-500">
              Texto ({ACCEPTED_EXTENSIONS.replaceAll(',', ', ')}), até 4 MB cada.
              Enviar um arquivo com o mesmo nome substitui a anotação anterior.
            </p>
          </div>

          <button
            type="submit"
            disabled={uploading !== null}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-xl transition text-sm"
          >
            <Upload className="w-4 h-4" />
            <span>{uploading !== null ? 'Enviando...' : 'Enviar'}</span>
          </button>

          {uploading && (
            <p role="status" className="text-sm italic text-slate-400">
              {uploading}
            </p>
          )}

          {results.length > 0 && (
            <ul className="space-y-1 text-sm">
              {results.map((result) => (
                <li
                  key={result.fileName}
                  className={result.ok ? 'text-emerald-300' : 'text-red-300'}
                >
                  <span className="font-medium">{result.fileName}:</span>{' '}
                  {result.message}
                </li>
              ))}
            </ul>
          )}
        </form>

        {/* Lista de anotações */}
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-slate-300">
            Anotações enviadas{notes ? ` (${notes.length})` : ''}
          </h2>

          {listError && (
            <p
              role="alert"
              className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-lg px-4 py-3"
            >
              {listError}
            </p>
          )}

          {notes === null && !listError && (
            <p className="text-sm text-slate-500">Carregando...</p>
          )}

          {notes?.length === 0 && (
            <p className="text-sm text-slate-500">
              Nenhuma anotação enviada ainda.
            </p>
          )}

          <ul className="space-y-2">
            {notes?.map((note) => (
              <li
                key={note.file_name}
                className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3"
              >
                <FileText className="w-4 h-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-100">
                    {note.file_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {note.chunks} bloco(s) · {formatDate(note.updated_at)}
                  </p>
                </div>

                {confirmingDelete === note.file_name ? (
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => handleDelete(note.file_name)}
                      disabled={deleting !== null}
                      className="rounded-lg bg-red-700 px-3 py-1.5 font-medium text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      {deleting === note.file_name ? 'Excluindo...' : 'Excluir'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(null)}
                      disabled={deleting !== null}
                      className="rounded-lg px-3 py-1.5 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(note.file_name)}
                    aria-label={`Excluir ${note.file_name}`}
                    className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
