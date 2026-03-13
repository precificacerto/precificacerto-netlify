# Tabela NCM – Importação para o Supabase

Esta pasta é usada para atualizar a tabela `ncm_codes` do Supabase com a tabela NCM completa.

## Como usar

1. **Obtenha um CSV com todos os NCMs**
   - Se você tem o PDF `Tabela_ncm_completa.pdf`: exporte a tabela para CSV (Excel, Google Sheets ou ferramentas como Adobe Acrobat / tabula).
   - Ou baixe a tabela NCM em CSV no site da Receita Federal / outros portais oficiais.

2. **Formato do CSV**
   - Colunas aceitas: `code`/`codigo`/`código` e `description`/`descricao`/`descrição`.
   - Separador: vírgula (`,`) ou ponto-e-vírgula (`;`).
   - O código pode vir no formato `1905.90.90` ou `19059090` (será normalizado).

3. **Coloque o arquivo aqui**
   - Nome sugerido: `Tabela_ncm_completa.csv`
   - Ou defina o caminho com a variável de ambiente `NCM_CSV_PATH`.

4. **Execute o script**
   - Na raiz do projeto: `node scripts/seed-ncm-from-csv.js`
   - Ou: `NCM_CSV_PATH="caminho/para/seu.csv" node scripts/seed-ncm-from-csv.js`

## Variáveis de ambiente

- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: use o arquivo `.env.local` na raiz do projeto (o script carrega automaticamente) ou exporte no terminal.
