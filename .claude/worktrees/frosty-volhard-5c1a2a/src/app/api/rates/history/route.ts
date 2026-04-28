// ============================================================
// app/api/rates/history/route.ts — Taux historiques X → MUR
// Frankfurter (ECB, gratuit) pour X→USD sur N jours
// × open.er-api.com pour USD→MUR (constant, approximation OK)
// ============================================================
import { NextResponse, type NextRequest } from "next/server"

const REVALIDATE_SECONDS = 60 * 60

const TARGETS = ["EUR", "USD", "GBP", "KES", "ZAR"] as const
type CurrencyCode = (typeof TARGETS)[number]

const DEFAULT_DAYS = 90
const MIN_DAYS = 1
const MAX_DAYS = 365
const FALLBACK_MUR_PER_USD = 46

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const currencyParam = searchParams.get("currency")
  const daysParam = searchParams.get("days")

  if (!currencyParam || !TARGETS.includes(currencyParam as CurrencyCode)) {
    return NextResponse.json(
      { error: "Paramètre « currency » invalide ou manquant (EUR, USD, GBP, KES, ZAR)." },
      { status: 400 },
    )
  }
  const currency = currencyParam as CurrencyCode

  let days = DEFAULT_DAYS
  if (daysParam !== null) {
    const parsed = Number(daysParam)
    if (!Number.isFinite(parsed)) {
      return NextResponse.json(
        { error: "Paramètre « days » invalide." },
        { status: 400 },
      )
    }
    days = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.floor(parsed)))
  }

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - days)
  const startStr = formatDate(startDate)
  const endStr = formatDate(endDate)

  try {
    let murPerUsd = FALLBACK_MUR_PER_USD
    const usdRes = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["rates-history"] },
      cache: "force-cache",
    })
    if (usdRes.ok) {
      const data = await usdRes.json()
      if (data?.rates?.MUR) murPerUsd = Number(data.rates.MUR)
    }

    const source = "frankfurter.app (X→USD) × open.er-api.com (USD→MUR, constant)"

    if (currency === "USD") {
      const points: { date: string; rate: number }[] = []
      const cursor = new Date(startDate)
      while (cursor <= endDate) {
        points.push({ date: formatDate(cursor), rate: murPerUsd })
        cursor.setDate(cursor.getDate() + 1)
      }
      return NextResponse.json({ currency, base: "MUR", points, source, murPerUsd })
    }

    const url = `https://api.frankfurter.app/${startStr}..${endStr}?from=${currency}&to=USD`
    const fxRes = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS, tags: ["rates-history"] },
      cache: "force-cache",
    })
    if (!fxRes.ok) {
      return NextResponse.json(
        { error: "Impossible de récupérer les taux historiques." },
        { status: 502 },
      )
    }

    const fxData = (await fxRes.json()) as { rates?: Record<string, Record<string, number>> }
    const rawRates = fxData.rates || {}

    const points = Object.entries(rawRates)
      .map(([date, obj]) => {
        const xToUsd = Number(obj?.USD || 0)
        return { date, rate: xToUsd > 0 ? xToUsd * murPerUsd : 0 }
      })
      .filter(p => p.rate > 0)
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({ currency, base: "MUR", points, source, murPerUsd })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Rates history fetch error:", error)
    return NextResponse.json(
      { error: "Erreur lors de la récupération de l'historique des taux.", detail: message },
      { status: 500 },
    )
  }
}
