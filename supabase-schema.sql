create table if not exists public.lotto_draws (
  id bigserial primary key,
  numbers int[] not null,
  created_at timestamptz not null default now()
);
