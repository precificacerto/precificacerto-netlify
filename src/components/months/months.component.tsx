import { FC } from 'react'
import { Month, monthObjects, MonthObjectType } from '@/constants/month'
import { Button } from 'antd'

type Props = {
  currentMonth: Month
  onChangeMonth: (month: MonthObjectType) => void
}

const Months: FC<Props> = ({ currentMonth, onChangeMonth }) => {
  return (
    <section className="max-w-[549px] w-full flex justify-around">
      {Object.values(monthObjects).map((month: MonthObjectType) => {
        const isActive =
          currentMonth?.toUpperCase() === month.short.toUpperCase() ? '#22c55e' : 'text-neutral-500'

        return (
          <Button
            key={month.short}
            className={`p-0 ${isActive}`}
            type="link"
            onClick={() => onChangeMonth(month)}
          >
            {month.short}
          </Button>
        )
      })}
    </section>
  )
}

export { Months }
