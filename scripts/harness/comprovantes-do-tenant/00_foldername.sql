-- EXTRAÍDO verbatim de produção (pg_get_functiondef, 19/10/2026): storage.foldername.
CREATE OR REPLACE FUNCTION storage.foldername(name text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$function$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
-- RECONSTRUÍDO: o índice único (bucket_id, name) que o upsert do Storage usa como alvo.
create unique index bucketid_objname on storage.objects (bucket_id, name);
