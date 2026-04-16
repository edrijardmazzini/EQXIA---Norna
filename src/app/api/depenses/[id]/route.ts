import { NextRequest, NextResponse } from "next/server"

const NOTION_VERSION = "2022-06-28"

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { description, date, fournisseur, categorie, sousCategorie, montant, devise, dossier } = body

    const properties: Record<string, unknown> = {}

    if (description != null) properties["Description"] = { rich_text: [{ text: { content: description } }] }
    if (date) properties["Date"] = { date: { start: date } }
    if (fournisseur != null) properties["Fournisseur"] = { rich_text: [{ text: { content: fournisseur } }] }
    if (categorie) properties["Catégorie"] = { select: { name: categorie } }
    if (sousCategorie) properties["Sous-catégorie"] = { select: { name: sousCategorie } }
    if (montant != null) properties["Montant"] = { number: Number(montant) || 0 }
    if (devise) properties["Devise"] = { select: { name: devise } }
    if (dossier != null) properties["Dossier"] = { rich_text: [{ text: { content: dossier } }] }

    const res = await fetch(`https://api.notion.com/v1/pages/${id}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ properties }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error("Notion update depense failed:", text)
      return NextResponse.json({ error: text }, { status: res.status })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error("Update depense error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
