import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { Button } from 'antd'
import { useRouter } from 'next/router'

enum ERRORS_CODE {
  PRODUCT_NOT_FOUND = 'Produto não encontrado!',
  YEAR_OR_MONTH_INVALID = 'Não pode encontrar página para o mês especificado!',
  YEAR_INVALID = 'Não pode encontrar página para o ano especificado, lembre de usar o ano atual ou ano anterior ou ano posterior!',
  NOT_FOUND_ERROR = '',
  NOT_ALLOWED = 'Acesso não autorizado!',
}

export default function Custom404() {
  const router = useRouter()
  const error: keyof typeof ERRORS_CODE = router.query?.error as keyof typeof ERRORS_CODE

  function handleClickGoHome() {
    router.push(ROUTES.DASHBOARD)
  }

  return (
    <Layout showAside={false} title={PAGE_TITLES.NOT_FOUND}>
      <div className="">
        {error && <div className="mt-8 mb-8">{ERRORS_CODE[error]}</div>}
        <Button onClick={handleClickGoHome}>Voltar para página principal</Button>
      </div>
    </Layout>
  )
}
