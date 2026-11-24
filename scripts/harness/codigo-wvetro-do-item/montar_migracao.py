"""Monta a 20261124000001 a partir do corpo de PRODUCAO de importar_conteudo_da_tabela (o da 20261123000004, md5 97abdae7...) e prova pelo diff
que a unica mudanca no corpo e a coluna `codigo_wvetro` no INSERT dos itens e no jsonb_to_recordset."""
import re, hashlib, difflib, sys, os
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')) + '/'
src = open(R + 'supabase/migrations/20261123000004_cor_do_item_da_tabela.sql', encoding='utf-8').read()
m = re.search(r'CREATE OR REPLACE FUNCTION public\.importar_conteudo_da_tabela\(p_tabela_id uuid, p_payload jsonb\)\n(.*?)AS \$function\$', src, re.S)
cab = m.group(0)
ini = m.end(); fim = src.index('$function$', ini)
velho = src[ini:fim]
assert hashlib.md5(velho.encode()).hexdigest() == '97abdae749f848c350152291f86b0eef'
novo = velho
for a, b in [
    ("    cor\n  )\n  SELECT", "    cor, codigo_wvetro\n  )\n  SELECT"),
    ("    x.cor\n  FROM", "    x.cor, x.codigo_wvetro\n  FROM"),
    ("    cor text\n  );", "    cor text, codigo_wvetro text\n  );"),
]:
    assert novo.count(a) == 1, a
    novo = novo.replace(a, b)
assert all(ord(c) < 128 for c in novo)
md5_novo = hashlib.md5(novo.encode()).hexdigest()
diff = [l for l in difflib.unified_diff(velho.split('\n'), novo.split('\n'), lineterm='', n=0) if l[:1] in '+-' and l[:3] not in ('+++', '---')]
print('\n'.join(diff)); print('md5 novo', md5_novo)
corpo = open(os.path.join(os.path.dirname(__file__), 'molde.sql'), encoding='ascii').read()
out = corpo.replace('@@CABECALHO_DA_FUNCAO@@', cab).replace('@@CORPO@@', novo).replace('@@MD5_NOVO@@', md5_novo)
assert '@@' not in out
open(R + 'supabase/migrations/20261124000001_codigo_wvetro_do_item_da_tabela.sql', 'w', encoding='ascii', newline='\n').write(out)
