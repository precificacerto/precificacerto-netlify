import { jsPDF } from 'jspdf'

/**
 * FEAT-CONTRACT-EMAIL (22/07/2026).
 *
 * Gera o "Contrato de Licença de Uso de Software SaaS — Precifica Certo" em PDF,
 * preenchido com os dados do CONTRATANTE (Nome/Razão Social, CPF/CNPJ, E-mail,
 * Telefone) e a data da assinatura por extenso.
 *
 * Reúsa jsPDF (já no projeto). Roda no SERVIDOR (webhook do Stripe) — usa apenas o
 * core do jsPDF (doc.text / splitTextToSize), sem plugins de browser, e devolve um
 * Buffer pronto para anexar no e-mail via nodemailer.
 *
 * O texto do contrato é transcrição fiel do documento oficial revisado 2026. O
 * cliente NÃO precisa assinar — o aceite eletrônico já ocorreu na contratação
 * (Cláusula 11.7). O PDF é apenas a via documental enviada ao contratante.
 */

export interface ContractParty {
  /** Nome/Razão Social do contratante. */
  name: string
  /** CPF ou CNPJ. Vazio => linha em branco para preenchimento manual. */
  cpfCnpj?: string | null
  email: string
  phone?: string | null
  /** Data da assinatura (dia do 1º pagamento). Default: agora. */
  signatureDate?: Date
}

const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** "São Sebastião do Caí/RS, 22 de julho de 2026." */
function formatSignatureLocation(date: Date): string {
  const dia = date.getDate()
  const mes = MESES_PT[date.getMonth()]
  const ano = date.getFullYear()
  return `São Sebastião do Caí/RS, ${dia} de ${mes} de ${ano}.`
}

/** Linha pontilhada quando o dado não foi informado (cliente preenche à mão). */
const BLANK_LINE = '__________________________'

type Block =
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'field'; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'item'; text: string }
  | { kind: 'rule' }
  | { kind: 'gap'; size?: number }

/** Estrutura fiel do contrato (transcrição do PDF oficial revisado 2026). */
function buildBlocks(party: ContractParty): Block[] {
  const date = party.signatureDate ?? new Date()
  const nome = (party.name || '').trim() || BLANK_LINE
  const doc = (party.cpfCnpj || '').trim() || BLANK_LINE
  const email = (party.email || '').trim() || BLANK_LINE
  const tel = (party.phone || '').trim() || BLANK_LINE

  return [
    { kind: 'h1', text: 'CONTRATO DE LICENÇA DE USO DE SOFTWARE SaaS' },
    { kind: 'h1', text: 'PRECIFICA CERTO' },
    { kind: 'gap' },

    { kind: 'h2', text: 'DA CONTRATADA' },
    {
      kind: 'para',
      text:
        'FELIPE GABRIEL KLEIN, inscrito no CNPJ sob nº 53.017.468/0001-55, com sede na RS 122, ' +
        'Km 9, nº 1835, São Sebastião do Caí/RS, CEP 95.760-000, endereço eletrônico ' +
        'precificacerto@gmail.com, doravante denominada CONTRATADA.',
    },
    { kind: 'gap' },

    { kind: 'h2', text: 'DO CONTRATANTE' },
    { kind: 'field', text: `Nome/Razão Social: ${nome}` },
    { kind: 'field', text: `CPF/CNPJ: ${doc}` },
    { kind: 'field', text: `E-mail: ${email}` },
    { kind: 'field', text: `Telefone: ${tel}` },
    { kind: 'gap' },

    {
      kind: 'para',
      text:
        'As partes acima identificadas resolvem celebrar o presente CONTRATO DE LICENÇA DE USO DE ' +
        'SOFTWARE SaaS, regido pelas cláusulas abaixo, pelo Código Civil Brasileiro, Código de Defesa ' +
        'do Consumidor, Marco Civil da Internet, Lei Geral de Proteção de Dados e demais legislações aplicáveis.',
    },
    {
      kind: 'para',
      text:
        'PARÁGRAFO ÚNICO. O presente contrato eletrônico produz efeitos jurídicos imediatamente a ' +
        'partir da contratação do PRECIFICA CERTO, independentemente de assinatura física, ' +
        'reconhecimento de firma, assinatura manuscrita ou impressão física, nos termos da legislação ' +
        'brasileira aplicável aos contratos eletrônicos.',
    },
    { kind: 'rule' },

    { kind: 'h2', text: 'CLÁUSULA PRIMEIRA – DO OBJETO' },
    {
      kind: 'para',
      text:
        '1.1. O presente contrato tem por objeto a concessão de licença temporária, limitada, onerosa, ' +
        'pessoal, revogável, não exclusiva e intransferível de uso da plataforma digital PRECIFICA ' +
        'CERTO, disponibilizada no modelo Software as a Service (SaaS), mediante acesso remoto via internet.',
    },
    {
      kind: 'para',
      text:
        '1.2. O PRECIFICA CERTO consiste em software de organização, estruturação, cálculo, ' +
        'processamento, demonstração e apresentação de informações financeiras, tributárias, ' +
        'operacionais, administrativas, comerciais e gerenciais inseridas exclusivamente pelo CONTRATANTE.',
    },
    {
      kind: 'para',
      text:
        '1.3. O software atua como ferramenta tecnológica de apoio operacional e gerencial, ' +
        'limitando-se a organizar e refletir os dados alimentados no sistema.',
    },
    { kind: 'para', text: '1.4. O CONTRATANTE reconhece expressamente que:' },
    { kind: 'item', text: 'a) o software depende integralmente das informações inseridas pelo usuário;' },
    { kind: 'item', text: 'b) dados incorretos, incompletos, desatualizados ou inconsistentes poderão gerar resultados incorretos;' },
    { kind: 'item', text: 'c) a plataforma não substitui contador, advogado, administrador, consultor financeiro, economista, auditor, controller ou qualquer profissional especializado;' },
    { kind: 'item', text: 'd) o software não realiza consultoria individualizada;' },
    { kind: 'item', text: 'e) o software não garante conformidade fiscal, tributária, societária, trabalhista ou contábil;' },
    { kind: 'item', text: 'f) o sistema não executa decisões empresariais automáticas;' },
    { kind: 'item', text: 'g) todas as decisões tomadas pelo CONTRATANTE são de sua exclusiva responsabilidade.' },
    { kind: 'para', text: '1.5. O presente contrato não constitui:' },
    { kind: 'item', text: 'a) sociedade;' },
    { kind: 'item', text: 'b) associação;' },
    { kind: 'item', text: 'c) representação comercial;' },
    { kind: 'item', text: 'd) consultoria empresarial;' },
    { kind: 'item', text: 'e) mandato;' },
    { kind: 'item', text: 'f) assessoria financeira;' },
    { kind: 'item', text: 'g) administração empresarial;' },
    { kind: 'item', text: 'h) vínculo empregatício;' },
    { kind: 'item', text: 'i) garantia de resultados.' },
    { kind: 'para', text: '1.6. A CONTRATADA compromete-se exclusivamente a disponibilizar:' },
    { kind: 'item', text: 'a) acesso ao software;' },
    { kind: 'item', text: 'b) funcionalidades contratadas;' },
    { kind: 'item', text: 'c) ambiente tecnológico;' },
    { kind: 'item', text: 'd) suporte operacional básico;' },
    { kind: 'item', text: 'e) atualizações técnicas e operacionais.' },
    { kind: 'rule' },

    { kind: 'h2', text: 'CLÁUSULA SEGUNDA – DA NATUREZA DO SERVIÇO' },
    { kind: 'para', text: '2.1. O PRECIFICA CERTO é disponibilizado exclusivamente em ambiente virtual online.' },
    { kind: 'para', text: '2.2. O acesso dependerá de:' },
    { kind: 'item', text: 'a) conexão ativa com internet;' },
    { kind: 'item', text: 'b) equipamento compatível;' },
    { kind: 'item', text: 'c) navegador atualizado;' },
    { kind: 'item', text: 'd) cadastro válido;' },
    { kind: 'item', text: 'e) adimplência financeira.' },
    { kind: 'para', text: '2.3. A CONTRATADA poderá modificar:' },
    { kind: 'item', text: 'a) layout;' },
    { kind: 'item', text: 'b) funcionalidades;' },
    { kind: 'item', text: 'c) integrações;' },
    { kind: 'item', text: 'd) recursos;' },
    { kind: 'item', text: 'e) ferramentas;' },
    { kind: 'item', text: 'f) infraestrutura tecnológica;' },
    { kind: 'item', text: 'g) arquitetura operacional;' },
    { kind: 'item', text: 'h) regras de funcionamento.' },
    { kind: 'para', text: '2.4. O CONTRATANTE reconhece que eventuais atualizações poderão alterar:' },
    { kind: 'item', text: 'a) fluxos;' },
    { kind: 'item', text: 'b) visual;' },
    { kind: 'item', text: 'c) experiência do usuário;' },
    { kind: 'item', text: 'd) funcionalidades;' },
    { kind: 'item', text: 'e) estrutura operacional.' },
    { kind: 'para', text: '2.5. O software poderá utilizar:' },
    { kind: 'item', text: 'a) APIs;' },
    { kind: 'item', text: 'b) servidores;' },
    { kind: 'item', text: 'c) gateways de pagamento;' },
    { kind: 'item', text: 'd) serviços em nuvem;' },
    { kind: 'item', text: 'e) plataformas parceiras;' },
    { kind: 'item', text: 'f) integrações de terceiros.' },
    { kind: 'rule' },

    { kind: 'h2', text: 'CLÁUSULA TERCEIRA – DOS PLANOS, ASSINATURAS E PAGAMENTOS' },
    { kind: 'para', text: '3.1. O uso do PRECIFICA CERTO ocorrerá mediante contratação de assinatura recorrente.' },
    { kind: 'para', text: '3.2. Os planos serão definidos conforme:' },
    { kind: 'item', text: 'a) faixa de faturamento;' },
    { kind: 'item', text: 'b) quantidade de usuários;' },
    { kind: 'item', text: 'c) funcionalidades contratadas;' },
    { kind: 'item', text: 'd) recursos disponibilizados.' },
    { kind: 'para', text: '3.3. Valores referenciais atuais:' },
    { kind: 'para', text: 'Empresas até R$ 200.000,00 de faturamento' },
    { kind: 'item', text: '• 1 usuário: R$ 99,90/mês' },
    { kind: 'item', text: '• Até 3 usuários: R$ 239,90/mês' },
    { kind: 'item', text: '• Até 5 usuários: R$ 299,90/mês' },
    { kind: 'item', text: '• Acima de 6 usuários: R$ 349,90/mês' },
    { kind: 'para', text: 'Empresas acima de R$ 200.000,00 de faturamento' },
    { kind: 'item', text: '• 1 usuário: R$ 299,90/mês' },
    { kind: 'item', text: '• Até 3 usuários: R$ 399,90/mês' },
    { kind: 'item', text: '• Até 5 usuários: R$ 499,90/mês' },
    { kind: 'item', text: '• Acima de 6 usuários: R$ 549,90/mês' },
    { kind: 'para', text: '3.4. Os valores poderão sofrer alterações comerciais, promocionais, operacionais, estratégicas ou inflacionárias.' },
    { kind: 'para', text: '3.5. Promoções realizadas em períodos distintos não geram direito à equiparação de valores, revisão contratual ou reembolso.' },
    { kind: 'para', text: '3.6. O não pagamento da mensalidade acarretará automaticamente:' },
    { kind: 'item', text: 'a) bloqueio de acesso;' },
    { kind: 'item', text: 'b) impossibilidade de login;' },
    { kind: 'item', text: 'c) suspensão das funcionalidades;' },
    { kind: 'item', text: 'd) interrupção do uso da plataforma.' },
    { kind: 'para', text: '3.7. O acesso ao sistema permanecerá ativo exclusivamente enquanto houver adimplência financeira.' },
    { kind: 'para', text: '3.8. A inadimplência autoriza a CONTRATADA a:' },
    { kind: 'item', text: 'a) suspender o acesso;' },
    { kind: 'item', text: 'b) cancelar a licença;' },
    { kind: 'item', text: 'c) interromper serviços;' },
    { kind: 'item', text: 'd) excluir dados após prazo razoável;' },
    { kind: 'item', text: 'e) encaminhar cobrança administrativa ou judicial.' },
    { kind: 'para', text: '3.9. O CONTRATANTE reconhece que a obrigação de pagamento decorre da disponibilização da plataforma, independentemente de utilização efetiva.' },
    { kind: 'rule' },

    { kind: 'h2', text: 'CLÁUSULA QUARTA – DO TESTE GRATUITO E GARANTIA' },
    { kind: 'para', text: '4.1. O CONTRATANTE terá prazo de 7 (sete) dias corridos para solicitar cancelamento e reembolso integral.' },
    { kind: 'para', text: '4.2. O prazo será contado a partir da confirmação da contratação.' },
    { kind: 'para', text: '4.3. Após o prazo previsto nesta cláusula:' },
    { kind: 'item', text: 'a) não haverá obrigação de reembolso;' },
    { kind: 'item', text: 'b) não haverá responsabilidade da CONTRATADA por estornos perante instituições financeiras;' },
    { kind: 'item', text: 'c) eventual obrigação financeira permanecerá vinculada à operadora de pagamento.' },
    { kind: 'para', text: '4.4. A garantia não se aplica:' },
    { kind: 'item', text: 'a) ao uso indevido da plataforma;' },
    { kind: 'item', text: 'b) à inadimplência;' },
    { kind: 'item', text: 'c) a tentativas de fraude;' },
    { kind: 'item', text: 'd) a compartilhamento indevido de acesso.' },
    { kind: 'rule' },

    { kind: 'h2', text: 'CLÁUSULA QUINTA – DAS OBRIGAÇÕES DA CONTRATADA' },
    { kind: 'para', text: '5.1. Disponibilizar acesso ao software conforme plano contratado.' },
    { kind: 'para', text: '5.2. Manter suporte técnico em horário comercial.' },
    { kind: 'para', text: '5.3. Empregar esforços razoáveis para estabilidade operacional.' },
    { kind: 'para', text: '5.4. Corrigir falhas técnicas em prazo operacional razoável.' },
    { kind: 'para', text: '5.5. A CONTRATADA não garante disponibilidade ininterrupta, ausência absoluta de falhas ou funcionamento livre de instabilidades.' },
    { kind: 'para', text: '5.6. A CONTRATADA poderá realizar:' },
    { kind: 'item', text: 'a) manutenções preventivas;' },
    { kind: 'item', text: 'b) manutenções corretivas;' },
    { kind: 'item', text: 'c) atualizações emergenciais;' },
    { kind: 'item', text: 'd) interrupções técnicas temporárias.' },
    { kind: 'rule' },

    { kind: 'h2', text: 'CLÁUSULA SEXTA – DAS OBRIGAÇÕES DO CONTRATANTE' },
    { kind: 'para', text: '6.1. O CONTRATANTE compromete-se a:' },
    { kind: 'item', text: 'a) fornecer informações verdadeiras;' },
    { kind: 'item', text: 'b) utilizar o sistema licitamente;' },
    { kind: 'item', text: 'c) manter sigilo de login e senha;' },
    { kind: 'item', text: 'd) não compartilhar acessos;' },
    { kind: 'item', text: 'e) não reproduzir o software;' },
    { kind: 'item', text: 'f) não realizar engenharia reversa;' },
    { kind: 'item', text: 'g) não praticar atos ilícitos;' },
    { kind: 'item', text: 'h) não utilizar robôs, automações abusivas ou invasões.' },
    { kind: 'para', text: '6.2. O CONTRATANTE é integralmente responsável pelos dados inseridos no sistema.' },
    { kind: 'para', text: '6.3. O CONTRATANTE reconhece que:' },
    { kind: 'item', text: 'a) a plataforma apenas reflete os dados inseridos;' },
    { kind: 'item', text: 'b) informações incorretas gerarão resultados incorretos;' },
    { kind: 'item', text: 'c) toda validação contábil, tributária, financeira e empresarial deve ser realizada pelo usuário.' },
    { kind: 'para', text: '6.4. É proibido:' },
    { kind: 'item', text: 'a) compartilhar acesso;' },
    { kind: 'item', text: 'b) comercializar contas;' },
    { kind: 'item', text: 'c) disponibilizar o sistema a terceiros;' },
    { kind: 'item', text: 'd) copiar estruturas;' },
    { kind: 'item', text: 'e) clonar funcionalidades;' },
    { kind: 'item', text: 'f) utilizar marca, layout ou metodologia da CONTRATADA sem autorização.' },
    { kind: 'rule' },

    { kind: 'h2', text: 'CLÁUSULA SÉTIMA – DA LIMITAÇÃO DE RESPONSABILIDADE' },
    { kind: 'para', text: '7.1. O PRECIFICA CERTO consiste em ferramenta tecnológica de apoio operacional.' },
    { kind: 'para', text: '7.2. A CONTRATADA não garante:' },
    { kind: 'item', text: 'a) lucro;' },
    { kind: 'item', text: 'b) crescimento empresarial;' },
    { kind: 'item', text: 'c) aumento de faturamento;' },
    { kind: 'item', text: 'd) redução de custos;' },
    { kind: 'item', text: 'e) sucesso comercial;' },
    { kind: 'item', text: 'f) conformidade tributária;' },
    { kind: 'item', text: 'g) recuperação financeira;' },
    { kind: 'item', text: 'h) estabilidade empresarial.' },
    { kind: 'para', text: '7.3. O CONTRATANTE reconhece que a atividade empresarial envolve riscos naturais e imprevisíveis.' },
    { kind: 'para', text: '7.4. A CONTRATADA não será responsável por:' },
    { kind: 'item', text: 'a) falência;' },
    { kind: 'item', text: 'b) recuperação judicial;' },
    { kind: 'item', text: 'c) insolvência;' },
    { kind: 'item', text: 'd) prejuízos comerciais;' },
    { kind: 'item', text: 'e) perdas financeiras;' },
    { kind: 'item', text: 'f) decisões empresariais;' },
    { kind: 'item', text: 'g) endividamento;' },
    { kind: 'item', text: 'h) erros tributários;' },
    { kind: 'item', text: 'i) autuações fiscais;' },
    { kind: 'item', text: 'j) passivos trabalhistas;' },
    { kind: 'item', text: 'k) prejuízos operacionais;' },
    { kind: 'item', text: 'l) perda de contratos;' },
    { kind: 'item', text: 'm) perda de clientes;' },
    { kind: 'item', text: 'n) redução de faturamento;' },
    { kind: 'item', text: 'o) estratégias comerciais inadequadas;' },
    { kind: 'item', text: 'p) informações incorretas inseridas no sistema.' },
    { kind: 'para', text: '7.5. O CONTRATANTE reconhece que o software apenas organiza informações fornecidas pelo próprio usuário.' },
    { kind: 'para', text: '7.6. Toda responsabilidade sobre:' },
    { kind: 'item', text: 'a) formação de preços;' },
    { kind: 'item', text: 'b) margens;' },
    { kind: 'item', text: 'c) cálculos empresariais;' },
    { kind: 'item', text: 'd) estratégias comerciais;' },
    { kind: 'item', text: 'e) gestão financeira;' },
    { kind: 'item', text: 'f) cumprimento legal;' },
    { kind: 'item', text: 'g) decisões administrativas;' },
    { kind: 'para', text: 'permanece exclusivamente com o CONTRATANTE.' },
    { kind: 'para', text: '7.7. A CONTRATADA não responderá por:' },
    { kind: 'item', text: 'a) danos indiretos;' },
    { kind: 'item', text: 'b) lucros cessantes;' },
    { kind: 'item', text: 'c) danos emergentes;' },
    { kind: 'item', text: 'd) perdas de oportunidade;' },
    { kind: 'item', text: 'e) impactos comerciais;' },
    { kind: 'item', text: 'f) consequências decorrentes do uso do sistema.' },
    { kind: 'rule' },

    { kind: 'h2', text: 'CLÁUSULA OITAVA – DA DISPONIBILIDADE E INFRAESTRUTURA' },
    { kind: 'para', text: '8.1. O CONTRATANTE reconhece que sistemas tecnológicos podem sofrer:' },
    { kind: 'item', text: 'a) falhas;' },
    { kind: 'item', text: 'b) bugs;' },
    { kind: 'item', text: 'c) indisponibilidades;' },
    { kind: 'item', text: 'd) lentidão;' },
    { kind: 'item', text: 'e) interrupções.' },
    { kind: 'para', text: '8.2. A CONTRATADA não será responsável por falhas decorrentes de:' },
    { kind: 'item', text: 'a) internet;' },
    { kind: 'item', text: 'b) energia elétrica;' },
    { kind: 'item', text: 'c) servidores externos;' },
    { kind: 'item', text: 'd) terceiros;' },
    { kind: 'item', text: 'e) provedores;' },
    { kind: 'item', text: 'f) ataques cibernéticos;' },
    { kind: 'item', text: 'g) força maior;' },
    { kind: 'item', text: 'h) caso fortuito.' },
    { kind: 'para', text: '8.3. O CONTRATANTE reconhece que pequenos defeitos técnicos são inerentes à atividade tecnológica.' },
    { kind: 'rule' },

    { kind: 'h2', text: 'CLÁUSULA NONA – DA PROPRIEDADE INTELECTUAL' },
    { kind: 'para', text: '9.1. Todo conteúdo relacionado ao PRECIFICA CERTO pertence exclusivamente à CONTRATADA.' },
    { kind: 'para', text: '9.2. É proibido:' },
    { kind: 'item', text: 'a) copiar;' },
    { kind: 'item', text: 'b) reproduzir;' },
    { kind: 'item', text: 'c) sublicenciar;' },
    { kind: 'item', text: 'd) vender;' },
    { kind: 'item', text: 'e) disponibilizar;' },
    { kind: 'item', text: 'f) distribuir;' },
    { kind: 'item', text: 'g) modificar;' },
    { kind: 'item', text: 'h) clonar;' },
    { kind: 'item', text: 'i) descompilar.' },
    { kind: 'para', text: '9.3. O descumprimento poderá gerar:' },
    { kind: 'item', text: 'a) cancelamento imediato;' },
    { kind: 'item', text: 'b) responsabilização civil;' },
    { kind: 'item', text: 'c) responsabilização criminal;' },
    { kind: 'item', text: 'd) indenização por perdas e danos.' },
    { kind: 'rule' },

    { kind: 'h2', text: 'CLÁUSULA DÉCIMA – DA LGPD E DADOS PESSOAIS' },
    { kind: 'para', text: '10.1. Os dados pessoais serão utilizados exclusivamente para:' },
    { kind: 'item', text: 'a) execução contratual;' },
    { kind: 'item', text: 'b) autenticação;' },
    { kind: 'item', text: 'c) suporte;' },
    { kind: 'item', text: 'd) comunicação;' },
    { kind: 'item', text: 'e) emissão fiscal;' },
    { kind: 'item', text: 'f) melhoria operacional.' },
    { kind: 'para', text: '10.2. A CONTRATADA poderá compartilhar dados com:' },
    { kind: 'item', text: 'a) plataformas parceiras;' },
    { kind: 'item', text: 'b) gateways de pagamento;' },
    { kind: 'item', text: 'c) servidores;' },
    { kind: 'item', text: 'd) integrações;' },
    { kind: 'item', text: 'e) sistemas operacionais necessários à execução dos serviços.' },
    { kind: 'para', text: '10.3. O tratamento observará a Lei Geral de Proteção de Dados.' },
    { kind: 'para', text: '10.4. O CONTRATANTE poderá solicitar:' },
    { kind: 'item', text: 'a) acesso;' },
    { kind: 'item', text: 'b) correção;' },
    { kind: 'item', text: 'c) anonimização;' },
    { kind: 'item', text: 'd) exclusão;' },
    { kind: 'item', text: 'e) revogação de consentimento.' },
    { kind: 'rule' },

    { kind: 'h2', text: 'CLÁUSULA DÉCIMA PRIMEIRA – DAS DISPOSIÇÕES GERAIS' },
    { kind: 'para', text: '11.1. Este contrato possui natureza exclusivamente civil e empresarial.' },
    { kind: 'para', text: '11.2. A tolerância de eventual descumprimento não implicará renúncia de direitos.' },
    { kind: 'para', text: '11.3. Caso alguma cláusula seja considerada inválida, as demais permanecerão válidas.' },
    { kind: 'para', text: '11.4. A CONTRATADA poderá atualizar este contrato a qualquer momento para adequações legais, operacionais, comerciais ou tecnológicas.' },
    { kind: 'para', text: '11.5. As comunicações oficiais ocorrerão eletronicamente.' },
    { kind: 'para', text: '11.6. O CONTRATANTE declara ter lido integralmente este contrato.' },
    { kind: 'para', text: '11.7. O aceite eletrônico equivale à assinatura válida para todos os efeitos legais.' },
    { kind: 'rule' },

    { kind: 'h2', text: 'CLÁUSULA DÉCIMA SEGUNDA – DO FORO' },
    {
      kind: 'para',
      text:
        '12.1. Fica eleito o foro da Comarca de São Sebastião do Caí/RS para dirimir eventuais ' +
        'controvérsias, observadas as hipóteses legais previstas no Código de Defesa do Consumidor.',
    },
    { kind: 'gap', size: 6 },

    { kind: 'field', text: formatSignatureLocation(date) },
    { kind: 'gap', size: 4 },
    { kind: 'para', text: 'CONTRATADA FELIPE GABRIEL KLEIN CNPJ nº 53.017.468/0001-55' },
    { kind: 'gap', size: 2 },
    { kind: 'field', text: `CONTRATANTE ${nome}` },
  ]
}

/** Monta o documento jsPDF do contrato (sem disparar download/output). */
export function buildContractDoc(party: ContractParty): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 56
  const marginTop = 64
  const marginBottom = 64
  const maxWidth = pageWidth - marginX * 2
  let y = marginTop

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage()
      y = marginTop
    }
  }

  const writeWrapped = (
    text: string,
    opts: { font: 'normal' | 'bold'; size: number; indent?: number; gapAfter: number; lineGap?: number }
  ) => {
    const indent = opts.indent ?? 0
    doc.setFont('helvetica', opts.font)
    doc.setFontSize(opts.size)
    const lines = doc.splitTextToSize(text, maxWidth - indent) as string[]
    const lineHeight = opts.size + (opts.lineGap ?? 3)
    for (const line of lines) {
      ensureSpace(lineHeight)
      doc.text(line, marginX + indent, y)
      y += lineHeight
    }
    y += opts.gapAfter
  }

  for (const block of buildBlocks(party)) {
    switch (block.kind) {
      case 'h1':
        writeWrapped(block.text, { font: 'bold', size: 15, gapAfter: 4 })
        break
      case 'h2':
        ensureSpace(28)
        writeWrapped(block.text, { font: 'bold', size: 12, gapAfter: 6 })
        break
      case 'field':
        writeWrapped(block.text, { font: 'bold', size: 10.5, gapAfter: 6 })
        break
      case 'para':
        writeWrapped(block.text, { font: 'normal', size: 10.5, gapAfter: 7 })
        break
      case 'item':
        writeWrapped(block.text, { font: 'normal', size: 10.5, indent: 18, gapAfter: 4 })
        break
      case 'gap':
        y += block.size ?? 8
        break
      case 'rule':
        ensureSpace(16)
        doc.setDrawColor(220)
        doc.line(marginX, y, pageWidth - marginX, y)
        y += 14
        break
    }
  }

  // Rodapé: numeração de páginas.
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(150)
    doc.text(`${i}`, pageWidth / 2, pageHeight - 28, { align: 'center' })
    doc.setTextColor(0)
  }

  return doc
}

/** Gera o PDF do contrato como Buffer, pronto para anexar em e-mail. */
export function buildContractPdfBuffer(party: ContractParty): Buffer {
  const doc = buildContractDoc(party)
  const arrayBuffer = doc.output('arraybuffer') as ArrayBuffer
  return Buffer.from(arrayBuffer)
}
