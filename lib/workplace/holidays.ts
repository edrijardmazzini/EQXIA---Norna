// Jours fériés Maurice 2026 — source : Public Holidays Act (MU)
// Les dates flottantes (fêtes religieuses) sont des estimations à vérifier sur la gazette officielle
export interface Holiday {
  name: string
  date: string
}

export const HOLIDAYS_MU_2026: Holiday[] = [
  { name: "New Year's Day",                date: '2026-01-01' },
  { name: 'New Year Holiday',              date: '2026-01-02' },
  { name: 'Thaipoosam Cavadee',            date: '2026-01-24' },
  { name: 'Abolition of Slavery',          date: '2026-02-01' },
  { name: 'Chinese Spring Festival',       date: '2026-02-17' },
  { name: 'Maha Shivaratri',               date: '2026-02-26' },
  { name: 'National Day',                  date: '2026-03-12' },
  { name: 'Eid-ul-Fitr',                   date: '2026-03-20' },
  { name: 'Labour Day',                    date: '2026-05-01' },
  { name: 'Eid-ul-Adha',                   date: '2026-05-27' },
  { name: 'Assumption of Mary',            date: '2026-08-15' },
  { name: 'Ganesh Chaturthi',              date: '2026-09-10' },
  { name: 'Divali',                        date: '2026-10-28' },
  { name: 'Arrival of Indentured Labourers', date: '2026-11-02' },
  { name: 'Christmas Day',                 date: '2026-12-25' },
]

export const HOLIDAY_DATES_MU: Set<string> = new Set(HOLIDAYS_MU_2026.map(h => h.date))
