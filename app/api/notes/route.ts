import { getAuthorizedUser, unauthorizedResponse } from '@/lib/auth';
import {
  MAX_FILE_BYTES,
  NoteError,
  deleteNote,
  ingestNote,
  listNotes,
} from '@/lib/notes';

// Gerar os vetores de um arquivo pode levar alguns segundos.
export const maxDuration = 60;

// GET /api/notes — lista as anotações já enviadas.
export async function GET() {
  if (!(await getAuthorizedUser())) return unauthorizedResponse();

  try {
    return Response.json(await listNotes());
  } catch (error) {
    console.error('Erro ao listar anotações:', error);
    return Response.json(
      { error: 'Não foi possível listar as anotações.' },
      { status: 500 }
    );
  }
}

// POST /api/notes — recebe um arquivo (campo "file") e o adiciona às anotações.
export async function POST(req: Request) {
  if (!(await getAuthorizedUser())) return unauthorizedResponse();

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return Response.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return Response.json(
        { error: 'Arquivo grande demais (máximo de 4 MB).' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    return Response.json(await ingestNote(file.name, buffer));
  } catch (error) {
    if (error instanceof NoteError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error('Erro ao enviar anotação:', error);
    return Response.json(
      { error: 'Não foi possível processar o arquivo. Tente novamente.' },
      { status: 500 }
    );
  }
}

// DELETE /api/notes?name=arquivo.txt — exclui uma anotação.
export async function DELETE(req: Request) {
  if (!(await getAuthorizedUser())) return unauthorizedResponse();

  const name = new URL(req.url).searchParams.get('name');
  if (!name) {
    return Response.json({ error: 'Anotação não informada.' }, { status: 400 });
  }

  try {
    await deleteNote(name);
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Erro ao excluir anotação:', error);
    return Response.json(
      { error: 'Não foi possível excluir a anotação.' },
      { status: 500 }
    );
  }
}
