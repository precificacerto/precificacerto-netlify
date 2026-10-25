# Harness da coluna `escolhas` (migração 20261025000001)

Postgres local (o mesmo dos outros harness; ver `../tres-niveis/README.md`). Não toca produção.

```bash
bash scripts/harness/escolhas-na-pre-definicao/run.sh          # a migração do repositório
python3 -B scripts/harness/escolhas-na-pre-definicao/mutacoes.py
```

- `00_como_em_producao.sql` escreve `orcamentista_pre_definicao` com as colunas medidas em produção
  em 25/10/2026. A migração que a criou (`20261020000003_atendimentos_ia_conversa`) está no histórico
  do banco e **não está no repositório** — `migration-delivery.md`.
- `run.sh` aplica a migração DUAS vezes (schema e dados idênticos) e roda os 4 casos.
- `mutacoes.py`: 6 mutações e o controle. Medido em 25/10/2026: 6 de 6 vermelhas, controle verde.

**Ressalva:** a verificação de dentro da migração confere que a CHECK **existe**, não o que ela diz.
Uma CHECK com o mesmo nome e outro conteúdo (V4) é pega só pelo caso 3 — por isso a V4 está na
bateria, e por isso o caso 3 não pode sair.
