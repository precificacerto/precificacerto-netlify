#!/usr/bin/env python3
"""As mutações da troca do arquivo no mesmo lugar (12/11/2026): a rota da edição, a da importação, a prévia, a tela e a nova tentativa do
envio. Cada trecho tem de aparecer UMA vez (senão aborta com código 3, antes de rodar suíte). Roda SOZINHA na árvore: muda o arquivo, roda as
suítes, e devolve o arquivo — nada mais pode ler a árvore enquanto ela roda (`mutacao-na-arvore-de-trabalho.md`)."""
import os, subprocess, sys
RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
PATCH = 'src/pages/api/super-admin/atendimentos-ia/tabelas/[id].ts'
IMP = 'src/pages/api/super-admin/atendimentos-ia/tabelas/[id]/importar.ts'
UTIL = 'src/utils/atendimentos-ia-importacao.ts'
API = 'src/page-parts/atendimentos-ia/api.ts'
TELA = 'src/pages/super-admin/atendimentos-ia/tabelas/[id]/importacao.tsx'
REPO = 'src/lib/atendimentos-ia/repositorio.ts'
SUITES = ['src/utils/__tests__/atendimentos-ia-importar-rota.test.ts', 'src/utils/__tests__/atendimentos-ia-categoria-da-tabela.test.ts',
          'src/utils/__tests__/atendimentos-ia-rotas.test.ts', 'src/utils/__tests__/atendimentos-ia-importar-ao-salvar.test.tsx',
          'src/utils/__tests__/atendimentos-ia-envio-com-nova-tentativa.test.ts', 'src/utils/__tests__/atendimentos-ia-a-tela-nao-fala-com-o-banco.test.ts']
MUT = [
    ('P1 a edição volta a gravar o arquivo na linha', PATCH, "    // o arquivo NÃO vai para a linha aqui", "    if (ed.arquivo) { campos.arquivo_path = ed.arquivo.path; campos.arquivo_nome = ed.arquivo.nome }\n    // o arquivo NÃO vai para a linha aqui"),
    ('P2 a edição volta a apagar o arquivo de antes', PATCH, "const trocados = [ed.motor && atual.motor_path]", "const trocados = [ed.arquivo && atual.arquivo_path, ed.motor && atual.motor_path]"),
    ('P3 a edição não devolve o pendente', PATCH, "const pendente = ed.arquivo ? { arquivo_pendente: ed.arquivo } : {}", "const pendente = {}"),
    ('I1 sem prévia: grava direto', IMP, "if (previa.antes > 0 && !confirmar)", "if (false)"),
    ('I2 sem a conferência do sha256', IMP, "if (confirmar && shaDaPrevia !== sha256)", "if (false)"),
    ('I3 sem a trava de encolher na rota', IMP, "if (previa.encolhe && !permitirEncolher)", "if (false)"),
    ('I4 o arquivo novo nunca vai à função', IMP, "permitirEncolher, arquivo: arquivoNovo })", "permitirEncolher, arquivo: null })"),
    ('I5 a permissão sempre verdadeira', IMP, "sha256, payload, permitirEncolher, arquivo", "sha256, payload, permitirEncolher: true, arquivo"),
    ('I6 todo 23514 vira encolher', IMP, "if (codigoDoErro(e) === '23514' && /encolheria/.test", "if (codigoDoErro(e) === '23514' || /encolheria/.test"),
    ('I7 lê o arquivo de hoje mesmo com o pendente', IMP, "const daTabela = arquivoNovo ?? {", "const daTabela = {"),
    ('U1 saem: os que o arquivo traz', UTIL, "const saem = [...gravadosUnicos].filter((c) => !doArquivo.has(c))", "const saem = [...gravadosUnicos].filter((c) => doArquivo.has(c))"),
    ('U2 encolhe com <=', UTIL, "encolhe: payload.itens.length < gravados.length", "encolhe: payload.itens.length <= gravados.length"),
    ('A1 "já existe" na primeira tentativa é sucesso', API, "if (tentativa > 1 && await jaExiste(res)) return null", "if (await jaExiste(res)) return null"),
    ('A2 repete qualquer falha', API, "if (!falhaDeTransporte(res.status)) return", "if (false) return"),
    ('A3 sem nova tentativa', API, "for (let tentativa = 1; tentativa <= TENTATIVAS_DO_ENVIO; tentativa++)", "for (let tentativa = 1; tentativa <= 1; tentativa++)"),
    ('A4 o 400 Duplicate não é "já existe"', API, "return String(j?.statusCode) === '409' || j?.error === 'Duplicate'", "return false"),
    ('T1 confirmar sem a caixa de encolher', TELA, "disabled={previa.encolhe && !permitirEncolher}", "disabled={false}"),
    ('T2 a confirmação sem o arquivo pendente', TELA, "if (arquivo) { corpo.arquivo_path = arquivo.path; corpo.arquivo_nome = arquivo.nome }", ""),
    ('T3 a confirmação sem a permissão', TELA, "corpo.permitir_encolher = permitirEncolher", "corpo.permitir_encolher = false"),
    ('T4 a recusa não mostra a prévia nova', TELA, "if (corpo?.previa) setPrevia(corpo.previa)", ""),
    ('R1 o repositório volta à de dentro', REPO, "db().rpc('superadmin_importar_tabela'", "db().rpc('importar_conteudo_da_tabela'"),
]
for nome, arq, de, para in MUT:
    n = open(os.path.join(RAIZ, arq)).read().count(de)
    if n != 1: print(f'ABORTA: {nome}: o trecho aparece {n} vez(es)'); sys.exit(3)
mortas = 0
for nome, arq, de, para in MUT:
    caminho = os.path.join(RAIZ, arq)
    original = open(caminho).read()
    try:
        open(caminho, 'w').write(original.replace(de, para))
        r = subprocess.run(['npx', 'jest', '--silent', *SUITES], cwd=RAIZ, capture_output=True, text=True)
    finally:
        open(caminho, 'w').write(original)
    morta = r.returncode != 0
    print(('morta ' if morta else 'VIVA  ') + nome, flush=True); mortas += morta
print(f'{mortas}/{len(MUT)} mortas'); sys.exit(0 if mortas == len(MUT) else 1)
