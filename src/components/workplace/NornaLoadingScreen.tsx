'use client'

import { EqxiaLoadingScreen } from '@/components/eqxia'
import { useBgImage } from './NornaShell'

// Wrapper plein écran : couvre header + sidebar du shell pendant un loading
// initial, en réutilisant le bg image piqué par NornaShell pour la cohérence.
export function NornaLoadingScreen() {
  const bgImage = useBgImage()
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 150 }}>
      <EqxiaLoadingScreen appName="Norna" bgImage={bgImage} />
    </div>
  )
}
