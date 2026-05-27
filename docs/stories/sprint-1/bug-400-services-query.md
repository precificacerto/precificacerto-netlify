# Sprint 1 — Bug: 400 Bad Request em `/rest/v1/services`

**Sprint:** 1
**Prioridade:** MÉDIA (não-bloqueante, mas polui console e pode esconder erros reais)
**Origem:** Descoberto durante validação Lighthouse Onda 3 em `/orcamentos` (2026-05-27).
**Status:** BACKLOG

---

## Sintoma

Em `/orcamentos`, o console do navegador mostra:

```
GET https://<supabase>.supabase.co/rest/v1/services?select=...&order=name.asc 400 (Bad Request)
```

A página carrega normalmente (UI funcional), mas o erro 400 aparece **sempre** no carregamento do módulo de orçamentos.

## NÃO causado pelo patch Onda 3

Verificado: o erro 400 é **pré-existente** ao deploy de hoje. Os patches da Onda 3 (dynamic imports ExcelJS/jsPDF) não tocaram em queries Supabase. Provavelmente está no código há semanas/meses, mas só agora foi notado.

## Hipóteses

1. **Coluna inexistente no `select`** — query pode estar pedindo coluna que foi renomeada/removida em alguma migration recente
2. **Filtro malformado** — `eq.{value}` com valor inválido (ex: `tenant_id=eq.undefined`)
3. **RLS bloqueando** — usuário não tem permissão na tabela `services`, mas a RLS retorna 400 ao invés de array vazio (caso raro)
4. **`order=name.asc` em coluna que não existe** — tabela `services` pode não ter coluna `name`

## Investigação sugerida

1. **Localizar a chamada**: `grep -rn "from('services')" src/` ou inspecionar Network tab para ver a query completa
2. **Verificar response body**: Supabase retorna `{ code, message, details, hint }` no 400 — abrir DevTools → Network → clicar no request → ver Response
3. **Comparar com schema atual**: `\d services` no SQL editor pra ver colunas reais
4. **Buscar usos do hook**: provavelmente em `src/hooks/useProducts.ts` ou similar (orçamentos puxa produtos+serviços juntos)

## Arquivos candidatos

- `src/pages/orcamentos/index.tsx` (módulo onde o erro aparece)
- `src/hooks/useProducts.ts` ou `src/hooks/useServices.ts` (se existir)
- `src/lib/supabaseClient.ts` (cliente)

## Critério de aceite

- [ ] Identificar arquivo e linha da query problemática
- [ ] Console em `/orcamentos` SEM erros 400
- [ ] Página funciona idêntico ao comportamento atual (lista produtos + serviços)
- [ ] Se a query era usada mas falhava silenciosamente, validar que a feature dependente continua OK

## Estimativa

1-2h (investigação + fix + smoke test).

## Risco

Baixo. Se o erro 400 está há tempos sem afetar UX, provavelmente é query órfã ou que o frontend tolera (`.catch` silencioso). Risco de regressão se a query é necessária e o frontend depende do response.

## Notas

Reportado pelo founder em smoke test pós-deploy Onda 3 (2026-05-27). Independente do trabalho de segurança/performance — pode ser pego junto com outros bugs miúdos do Sprint 1.
