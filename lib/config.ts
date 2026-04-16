// ============================================================
// lib/config.ts — Configuration centralisée Eqxia Dépenses
// ============================================================

export const CATEGORIES_SOUS_CATS: Record<string, string[]> = {
  "Frais de personnel":           ["Salaires & cotisations", "Avantages employés"],
  "Locaux & immobilier":          ["Loyer & charges", "Internet & télécom", "Entretien locaux"],
  "Matériel & équipement":        ["Informatique", "Mobilier", "Logiciels & licences"],
  "Fournitures":                  ["Fournitures de bureau", "Consommables"],
  "Transport & déplacements":     ["Carburant & transport", "Hôtels & restauration", "Frais de déplacement"],
  "Prestations externes":         ["Consultants & agences", "Freelancers & prestataires", "Services comptables"],
  "Marketing & communication":    ["Publicités & digital", "Création & design", "Événements", "Cadeaux clients"],
  "Assurances":                   ["Responsabilité civile", "Couverture véhicules"],
  "Frais bancaires & financiers": ["Commissions bancaires", "Intérêts & charges"],
  "Formation & développement":    ["Formations professionnelles", "Conférences & certifications"],
  "Cloud & informatique":         ["Services Cloud", "Outils SaaS", "APIs & services", "Hébergement"],
  "Entretien & réparations":      ["Maintenance équipements", "Rénovations & travaux"],
}

export const PAYEURS = [
  { tag: "JGS", label: "Julien (JGS)",        nomComplet: "Julien Guillot-Sestier",  color: "#E3F2FD" },
  { tag: "AG",  label: "Alex (AG)",            nomComplet: "Alexandre Govin",         color: "#FFF3E0" },
  { tag: "PL",  label: "Pierre-Louis (PL)",    nomComplet: "Pierre-Louis Patenôtre",  color: "#E8F5E9" },
  { tag: "EQXIA", label: "Eqxia",             nomComplet: null,                      color: "#F3E5F5" },
]

export const DEVISES = ["EUR", "USD", "MUR"] as const
export type Devise = typeof DEVISES[number]

export function calculerMontantMUR(montant: number, devise: Devise): number {
  const taux: Record<Devise, number> = {
    EUR: parseFloat(process.env.TAUX_EUR_MUR || "48.5"),
    USD: parseFloat(process.env.TAUX_USD_MUR || "44.2"),
    MUR: 1,
  }
  return Math.round(montant * taux[devise] * 100) / 100
}

export function construireDossierMensuel(dateStr: string): string {
  const d = new Date(dateStr)
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return yy + mm
}

export function detecterPayeurDepuisNom(nomFichier: string) {
  const up = nomFichier.toUpperCase()
  return PAYEURS.find(p => up.includes(p.tag)) || null
}
