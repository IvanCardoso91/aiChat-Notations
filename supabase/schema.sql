-- Estrutura do banco do Assistente de Infraestrutura.
-- Execute no SQL Editor do Supabase.

create extension if not exists vector with schema extensions;

-- Blocos de texto das anotações, com o vetor usado na busca.
create table if not exists document_sections (
  id bigint primary key generated always as identity,
  file_name text not null,
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);

alter table document_sections enable row level security;

-- Busca os blocos mais parecidos com a pergunta (similaridade de cosseno).
create or replace function match_document_sections (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (id bigint, file_name text, content text, similarity float)
language sql stable
as $$
  select ds.id, ds.file_name, ds.content,
         1 - (ds.embedding <=> query_embedding) as similarity
  from document_sections ds
  where ds.embedding is not null
    and 1 - (ds.embedding <=> query_embedding) > match_threshold
  order by ds.embedding <=> query_embedding
  limit match_count;
$$;

-- Histórico de conversas: cada conversa pertence a um usuário, e as
-- mensagens ficam em JSON.
create table if not exists conversations (
  id text primary key,
  user_id uuid references auth.users (id) on delete cascade,
  title text not null,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_at_idx
  on conversations (user_id, updated_at desc);

alter table conversations enable row level security;
