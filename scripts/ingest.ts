// Ingestão em lote pela linha de comando: envia todos os arquivos de
// scripts/notas para a base de anotações. Usa a mesma função do upload do app,
// então um arquivo já enviado é substituído, sem duplicar blocos.
//
// As variáveis do .env.local são carregadas pelo próprio comando
// (`tsx --env-file=.env.local`, definido em package.json).
import * as fs from 'fs';
import * as path from 'path';
import { ALLOWED_EXTENSIONS, NoteError, ingestNote } from '../lib/notes';

async function runIngestion() {
  const notasDir = path.join(process.cwd(), 'scripts', 'notas');

  if (!fs.existsSync(notasDir)) {
    fs.mkdirSync(notasDir, { recursive: true });
    console.log(
      '📁 Pasta scripts/notas criada! Coloque seus arquivos lá dentro e rode novamente.'
    );
    return;
  }

  const files = fs
    .readdirSync(notasDir)
    .filter((file) => fs.statSync(path.join(notasDir, file)).isFile());

  if (files.length === 0) {
    console.log(
      '⚠️ NENHUM ARQUIVO ENCONTRADO em scripts/notas. Adicione alguns arquivos e execute o script.'
    );
    return;
  }

  console.log(`🚀 Iniciando ingestão de ${files.length} arquivo(s)...`);

  let falhas = 0;

  for (const file of files) {
    console.log(`\n📄 Processando: ${file}`);

    try {
      const buffer = fs.readFileSync(path.join(notasDir, file));
      const { chunks } = await ingestNote(file, buffer);
      console.log(`✅ ${chunks} bloco(s) salvo(s) no banco.`);
    } catch (err: unknown) {
      falhas++;
      if (err instanceof NoteError) {
        // Arquivo vazio, grande demais ou de um tipo não aceito.
        console.error(`⚠️ ${file} não foi enviado: ${err.message}`);
      } else {
        console.error(
          `❌ Erro ao processar ${file}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  if (falhas > 0) {
    console.error(
      `\n⚠️ Ingestão finalizada com ${falhas} arquivo(s) com erro. Tipos aceitos: ${ALLOWED_EXTENSIONS.join(', ')}.`
    );
    process.exitCode = 1;
  } else {
    console.log('\n🎉 Ingestão concluída com sucesso!');
  }
}

const requiredEnv = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);

if (missingEnv.length > 0) {
  console.error(
    `❌ Erro: faltam variáveis no .env.local: ${missingEnv.join(', ')}`
  );
  process.exit(1);
}

runIngestion();
