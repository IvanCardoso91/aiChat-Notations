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

-- Busca só por significado (similaridade de cosseno). Usada como reserva
-- quando a busca híbrida não está disponível.
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

-- Busca híbrida: combina a busca por significado (vetores) com a busca por
-- termos exatos (nomes de servidor, códigos de erro, comandos).

-- Texto indexado para a busca por termos: nome do arquivo + conteúdo.
alter table document_sections
  add column if not exists fts tsvector
  generated always as (
    to_tsvector('portuguese', coalesce(file_name, '') || ' ' || content)
  ) stored;

create index if not exists document_sections_fts_idx
  on document_sections using gin (fts);

create or replace function hybrid_search_document_sections (
  query_text text,
  query_embedding vector(768),
  match_count int,
  match_threshold float default 0.3
)
returns table (id bigint, file_name text, content text, similarity float)
language sql stable
as $$
  with corpus as (
    select count(*)::float as total from document_sections
  ),
  -- Termos da pergunta (sem palavras comuns como "de", "o", "qual") e em
  -- quantos blocos cada um aparece.
  terms as materialized (
    select lex,
           quote_literal(lex)::tsquery as term_query,
           (select count(*) from document_sections d
             where d.fts @@ quote_literal(lex)::tsquery) as frequency
    from unnest(tsvector_to_array(to_tsvector('portuguese', query_text))) as lex
    where length(lex) > 1
  ),
  -- Peso de cada termo: quanto mais raro nas anotações, mais ele vale.
  weighted_terms as materialized (
    select t.term_query,
           ln(1 + c.total / t.frequency) as weight,
           t.frequency <= greatest(3, 0.05 * c.total) as is_rare
    from terms t, corpus c
    where t.frequency > 0
  ),
  -- Busca por termos: só entram blocos que contêm ao menos um termo raro da
  -- pergunta (um nome de servidor, um código de erro), para que palavras
  -- comuns sozinhas não tragam anotações sem relação.
  keyword_scores as (
    select ds.id, sum(wt.weight) as score
    from document_sections ds
    join weighted_terms wt on ds.fts @@ wt.term_query
    group by ds.id
    having bool_or(wt.is_rare)
  ),
  -- Descarta coincidências fracas: fica só quem chega a pelo menos metade da
  -- pontuação do melhor bloco.
  keyword as (
    select ks.id, row_number() over (order by ks.score desc, ks.id) as rank
    from keyword_scores ks
    where ks.score >= 0.5 * (select max(score) from keyword_scores)
    order by ks.score desc, ks.id
    limit match_count * 2
  ),
  -- Busca por significado: blocos mais próximos da pergunta.
  semantic as (
    select ds.id,
           row_number() over (order by ds.embedding <=> query_embedding) as rank
    from document_sections ds
    where ds.embedding is not null
      and 1 - (ds.embedding <=> query_embedding) > match_threshold
    order by ds.embedding <=> query_embedding
    limit match_count * 2
  ),
  -- Junta as duas listas (Reciprocal Rank Fusion): quem aparece bem colocado
  -- nas duas fica no topo.
  fused as (
    select coalesce(s.id, k.id) as id,
           coalesce(1.0 / (50 + s.rank), 0) + coalesce(1.0 / (50 + k.rank), 0) as score
    from semantic s
    full outer join keyword k on s.id = k.id
  )
  select ds.id, ds.file_name, ds.content,
         1 - (ds.embedding <=> query_embedding) as similarity
  from fused
  join document_sections ds on ds.id = fused.id
  order by fused.score desc, ds.id
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
