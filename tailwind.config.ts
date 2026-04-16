import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'eq-black':       '#000000',
        'eq-brand-teal':  '#d0e1e2',
        'eq-heading-teal':'#A6C9CE',
        'eq-dark-grey':   '#53585F',
        'eq-med-grey':    '#5E5E5E',
        'eq-white':       '#FFFFFF',
      },
    },
  },
  plugins: [],
}
export default config
