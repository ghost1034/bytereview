import type { FxQuote } from '../../types'

export type MoneyAmount = { amount: number; currency: string; fxQuoteId?: string }
export type MoneyByCurrency = Record<string, number>

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** Aggregate without silently combining currencies. An explicit quote is required for conversion. */
export function aggregateMoney(
  amounts: MoneyAmount[],
  targetCurrency?: string,
  quotes: FxQuote[] = [],
): MoneyByCurrency {
  return amounts.reduce<MoneyByCurrency>((totals, item) => {
    let currency = item.currency.toUpperCase()
    let amount = item.amount
    if (targetCurrency && currency !== targetCurrency.toUpperCase() && item.fxQuoteId) {
      const quote = quotes.find((candidate) => candidate.id === item.fxQuoteId)
      if (quote && quote.baseCurrency === currency && quote.quoteCurrency === targetCurrency.toUpperCase()) {
        currency = targetCurrency.toUpperCase()
        amount *= quote.rate
      }
    }
    totals[currency] = roundMoney((totals[currency] ?? 0) + amount)
    return totals
  }, {})
}

export function currencyPair(baseCurrency: string, quoteCurrency: string): string {
  return `${baseCurrency.toUpperCase()}/${quoteCurrency.toUpperCase()}`
}
