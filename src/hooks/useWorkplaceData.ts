'use client'

// Re-export du hook context-based : la donnée est fetchée une seule fois au
// niveau du layout (WorkplaceDataProvider), et toutes les pages la consomment
// via le context. Pas de re-fetch ni de loading screen quand on change d'onglet.
export { useWorkplaceData } from '@/components/workplace/WorkplaceDataProvider'
