\set ON_ERROR_STOP 0
create or replace function pg_temp.ok(cond boolean, nome text) returns void language plpgsql as $$
begin if cond then raise notice 'ok: %', nome; else raise exception 'FALHOU %', nome; end if; end $$;
-- o service_role grava (como a funcao)
set role service_role;
insert into public.audio_transcription_usage (tenant_id, duration_seconds, provider, status) values
  ('a0000000-0000-0000-0000-00000000000a', 42, 'groq', 'ok'), ('a0000000-0000-0000-0000-00000000000a', 200, null, 'bloqueado_duracao'),
  ('a0000000-0000-0000-0000-00000000000b', 30, 'groq', 'ok');
reset role;
-- CASO 1: o service_role grava as tres linhas
select pg_temp.ok((select count(*) from public.audio_transcription_usage) = 3, 'caso 1 — o service_role grava o uso');
-- CASO 2: a empresa A le so o seu (2), nunca o da B
set role authenticated; set request.jwt.claim.sub = 'c0000000-0000-0000-0000-00000000000a';
select pg_temp.ok((select count(*) from public.audio_transcription_usage) = 2 and (select count(*) from public.audio_transcription_usage where tenant_id = 'a0000000-0000-0000-0000-00000000000b') = 0, 'caso 2 — a empresa A le so o seu uso, e nada da B');
-- CASO 3: a empresa B le so o seu (1)
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-00000000000b';
select pg_temp.ok((select count(*) from public.audio_transcription_usage) = 1, 'caso 3 — a empresa B le so o seu uso');
-- CASO 4: o super admin le todos
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-0000000000ff';
select pg_temp.ok((select count(*) from public.audio_transcription_usage) = 3, 'caso 4 — o super admin le o uso de todas');
-- CASO 5: authenticated nao grava (nem a propria empresa)
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-00000000000a';
do $$ begin
  begin insert into public.audio_transcription_usage (tenant_id, status) values ('a0000000-0000-0000-0000-00000000000a', 'ok');
  exception when insufficient_privilege then raise notice 'ok: caso 5 — authenticated nao grava o uso'; return; end;
  raise exception 'FALHOU caso 5: gravou';
end $$;
-- CASO 6: a configuracao do teto, so o super admin le; a empresa nao
select pg_temp.ok((select count(*) from public.audio_transcription_settings) = 0, 'caso 6 — a empresa nao le a configuracao do teto');
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-0000000000ff';
-- CASO 7: o super admin le a configuracao do teto
select pg_temp.ok((select count(*) from public.audio_transcription_settings where not teto_ligado) = 1, 'caso 7 — o super admin le o teto, nascido desligado');
reset role;
-- CASO 8: anon nao le nada
set role anon;
do $$ begin
  begin perform 1 from public.audio_transcription_usage;
  exception when insufficient_privilege then raise notice 'ok: caso 8 — anon nao le o uso'; return; end;
  raise exception 'FALHOU caso 8: leu';
end $$;
reset role;
-- CASO 9: as CHECKs: status fora da lista, ok sem provider, provider fora da lista, o teto ligado sem valor
do $$ declare n int := 0; begin
  begin insert into public.audio_transcription_usage (tenant_id, status) values ('a0000000-0000-0000-0000-00000000000a', 'outro'); exception when check_violation then n := n + 1; end;
  begin insert into public.audio_transcription_usage (tenant_id, status) values ('a0000000-0000-0000-0000-00000000000a', 'ok'); exception when check_violation then n := n + 1; end;
  begin insert into public.audio_transcription_usage (tenant_id, provider, status) values ('a0000000-0000-0000-0000-00000000000a', 'whisper', 'falha'); exception when check_violation then n := n + 1; end;
  begin update public.audio_transcription_settings set teto_ligado = true; exception when check_violation then n := n + 1; end;
  begin insert into public.audio_transcription_settings (id) values (2); exception when check_violation then n := n + 1; end;
  if n = 5 then raise notice 'ok: caso 9 — as cinco CHECKs recusam'; else raise exception 'FALHOU caso 9: % de 5', n; end if;
end $$;
