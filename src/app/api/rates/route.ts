// ============================================================
// app/api/rates/route.ts — Fetch live currency rates → MUR
// Utilise Frankfurter (European Central Bank, free, pas de clé)
// + fallback open.er-api.com pour KES/ZAR (non supportés par Frankfurter)
// ============================================================
import { NextResponse } from "next/server"

const REVALIDATE_SECONDS = 60 * 60 * 6 // cache 6h

// Devises possibles dans la DB Projects
const TARGETS = ["EUR", "USD", "GBP", "KES", "ZAR"] as const
type CurrencyCode = typeof TARGETS[number]

export async function GET() {
  try {
    const rates: Record<string, number> = { MUR: 1 }

    // Approche : pour chaque devise X, on veut 1 X = ? MUR.
    // Frankfurter supporte un endpoint /latest?from=X&to=MUR
    // Mais MUR n'est pas supporté par Frankfurter. On passe donc par l'USD :
    //   1 X = (USD per X) × (MUR per USD)
    // Pour MUR per USD, on utilise open.er-api.com (gratuit sans clé).

    // 1. MUR per USD via open.er-api.com
    const usdRes = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: REVALIDATE_SECONDS },
    })
    let murPerUsd = 46 // fallback par défaut
    if (usdRes.ok) {
      const data = await usdRes.json()
      if (data?.rates?.MUR) murPerUsd = Number(data.rates.MUR)
    }

    rates["USD"] = murPerUsd

    // 2. Pour les autres devises (EUR, GBP, KES, ZAR) : 1 X = (USD per X) × murPerUsd
    //    open.er-api.com/latest/USD donne USD → tous → inverse pour obtenir X → USD
    if (usdRes.ok) {
      const data = await usdRes.clone().json()
      const usdRates = data?.rates || {}
      for (const cur of TARGETS) {
        if (cur === "USD") continue
        const xPerUsd = Number(usdRates[cur] || 0) // ex: 0.92 EUR per 1 USD
        if (xPerUsd > 0) {
          rates[cur] = murPerUsd / xPerUsd
        }
      }
    }

    // Fallbacks durs si l'API a échoué
    const FALLBACKS: Record<string, number> = { MUR: 1, EUR: 49, USD: 46, GBP: 57, KES: 0.35, ZAR: 2.5 }
    for (const cur of ["MUR", ...TARGETS]) {
      if (!rates[cur] || !isFinite(rates[cur])) rates[cur] = FALLBACKS[cur]
    }

    return NextResponse.json({
      base: "MUR",
      // Format: 1 <cur> = rates[cur] MUR
      rates,
      updated: new Date().toISOString(),
      source: "open.er-api.com",
    })
  } catch (error: any) {
    console.error("Rates fetch error:", error)
    // Fallback complet si tout échoue
    return NextResponse.json({
      base: "MUR",
      rates: { MUR: 1, EUR: 49, USD: 46, GBP: 57, KES: 0.35, ZAR: 2.5 },
      updated: new Date().toISOString(),
      source: "fallback",
      error: error.message,
    })
  }
}
