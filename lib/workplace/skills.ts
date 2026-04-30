// Mapping project type → Specializations attendues
// Source de vérité partagée entre /workplace/projects et l'API /workplace/ai/staff
// (cohérence du scoring déterministe et IA)

export const PROJECT_TYPE_SKILLS: Record<string, string[]> = {
  Workshop:           ['Training & Facilitation', 'AI Strategy', 'Prompt Engineering'],
  Training:           ['Training & Facilitation', 'AI Strategy', 'Prompt Engineering'],
  Audit:              ['AI Strategy', 'Data & Analytics', 'Change Management'],
  Consulting:         ['AI Strategy', 'Change Management', 'Sales & BD'],
  Development:        ['Technical Implementation', 'Automation', 'Product Development'],
  'Strategic Review': ['AI Strategy', 'Sales & BD'],
  Retainer:           ['AI Strategy', 'Change Management'],
  Internal:           [],
}

export function expectedSkillsFor(projectType: string): string[] {
  return PROJECT_TYPE_SKILLS[projectType] || []
}

// Returns 0..1 — proportion of expected skills the person has
export function skillMatch(personSpecializations: string[], projectType: string): number {
  const expected = expectedSkillsFor(projectType)
  if (expected.length === 0) return 0
  const matches = expected.filter(s => personSpecializations.includes(s)).length
  return matches / expected.length
}
