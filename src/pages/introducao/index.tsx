import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'

export default function Introduction() {
  return (
    <Layout title={PAGE_TITLES.INTRODUCTION}>
<iframe width="560" height="315" src="https://www.youtube.com/embed/Klcvn2OwA_8?si=JVaAC-0pA4STOljA" title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen></iframe>
      <section className="p-6">
        <h1 className="text-black font-bold font-roboto text-xl">Informações importantes</h1>
        <p className="text-black text-justify font-roboto">
          Antes de tudo é preciso dizer muito obrigado pela confiança e por fazer parte dessa nova
          etapa.
        </p>
        <p className="text-black text-justify font-roboto">
          Nesta plataforma, o foco é a precificação de seus produtos e serviços, onde você terá em
          suas mãos os dados necessários para elaborar vendas agressivas ou mais lucrativas. A
          metodologia por margem permite o melhor entendimento de seu negócio.{' '}
        </p>
        <p className="text-black text-justify font-roboto">
          Mas antes de começar é preciso alinhar as expectativas e explicar as recomendações.
        </p>
        <p className="text-black text-justify font-roboto">
          Cada empresa possui seu coeficiente, ajustando conforme a necessidade de cada uma. A
          precificação é realizada através de seus custos e despesas, onde o valor final de venda
          deve pagar todos encargos do mês.
        </p>
        <p className="text-black text-justify font-roboto">
          Ao calcular o preço de venda do produto ou serviço, caso o valor fique incompatível com
          sua estratégia ou valor de mercado, poderá rever se necessário, toda a operação. O método
          traz uma visão ampla do que deve ser reduzido, para num futuro próximo, as vendas se
          tornarem mais lucrativas.
        </p>
        <p className="text-black text-justify font-roboto">
          A base de qualquer precificação é o custo do produto (CMV), bem como despesas. É correto
          afirmar que, em qualquer empresa, são as despesas que condicionam a precificação de seus
          produtos, o gestor só acrescenta a lucratividade.
        </p>
        <p className="text-black text-justify font-roboto">
          Preço de Venda = custo do produto + despesas + lucro
        </p>
        <ul className="list-disc list-inside">
          <li className="font-roboto py-1 text-justify">
            É recomendado para uma precificação precisa, que seja feito o preenchimento financeiro
            (caixa) dos últimos 12 meses, pois nosso sistema utiliza a média como base. Porém,
            preenchimento de poucos meses não impede que a precificação seja realizada.
          </li>
          <li className="font-roboto py-1 text-justify">
            No caixa deverá ser inserido somente o que realmente for recebido e pago, realizado no
            dia. (Não realize previsões)
          </li>
          <li className="font-roboto py-1 text-justify">
            O primeiro passo para a concepção dos produtos, é inserir os itens que serão utilizados.
          </li>
          <li className="font-roboto py-1 text-justify">
            Na guia configurações, é obrigatório preencher o percentual do regime tributário de seu
            setor quando o simples for selecionado. Assim como quantidade de funcionários de cada
            setor.
          </li>
          <li className="font-roboto py-1 text-justify">
            A plataforma é totalmente direcionada para Regime SIMPLES ou MEI.
          </li>
        </ul>
        <h1 className="text-black font-bold font-roboto text-xl">Bônus</h1>
        <h1 className="text-black font-bold font-roboto text-lg">Sobre SMART PRICE</h1>
        <p className="text-black text-justify font-roboto">
          Colocamos dentro da plataforma, para que você tenha mais facilidade para a utilização. Seu
          funcionamento inteligente, se dá, com o preenchimento dos valores de venda, comissões e
          lucros. Aplicado o desconto, a Smart Price reduz proporcionalmente os percentuais de lucro
          e comissão, resultando com precisão no valor de venda, comissão e lucro.
        </p>
        <h1 className="text-black font-bold font-roboto text-lg">Sobre MENTORADO</h1>
        <p className="text-black text-justify font-roboto">
          Serão 3 atendimentos auxiliando sobre a forma de precificar utilizando o método (Com
          agendamento). Agendamento deverá ser pelo whatsapp ou e-mail{' '}
          <strong>precificacerto@gmail.com</strong>.
        </p>
        <p className="text-black text-justify font-roboto">
          Toda empresa possui seu modelo e formas de trabalho. Então estamos disponibilizando 3
          sessões de nosso mentorado, promovendo soluções com base em nosso método para que consiga
          resultados assertivos de seus serviços ou de seu CMV (custo da mercadoria vendida).
        </p>
        <h1 className="text-black font-bold font-roboto text-lg">
          Como entrar em contato com o suporte
        </h1>
        <p className="text-black text-justify font-roboto">
          O Suporte do Precifica Certo é um suporte para dúvidas relacionadas a questões técnicas do
          uso. Não temos suporte para dúvidas teóricas. Para entrar em contato com o time de suporte
          é só enviar um e-mail para <strong>precificacerto@gmail.com</strong> ou através da aba
          Suporte no menu lateral.
        </p>
        <h1 className="text-black font-bold font-roboto text-lg">Contrato do Precifica Certo</h1>
        <p className="text-black text-justify font-roboto">
          Você pode consultar o contrato a qualquer momento, basta{' '}
          <a
            className="font-bold text-[#22c55e] hover:text-[#22c55e]/80"
            href="https://drive.google.com/file/d/14mW2bKQVTDTrvGc_WaIIWvjfC5G3hg1s/view?usp=sharing"
            target="_blank"
          >
            clicar aqui!
          </a>
        </p>
        <p className="text-black text-justify italic font-roboto">
          Me mande notícias de seu desempenho no meu inbox. Boas vendas. Desejo que você lucre
          muito!
        </p>
      </section>
    </Layout>
  )
}

