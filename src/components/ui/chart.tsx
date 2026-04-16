"use client"

import * as React from "react"
import { Tooltip as RechartsTooltip } from "recharts"

// ─── Chart container ──────────────────────────────────────────────────────────

export function ChartContainer({
  children,
  className,
  style,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={className} style={{ width: "100%", ...style }}>
      {children}
    </div>
  )
}

// ─── Chart tooltip (styled for Eqxia theme) ──────────────────────────────────

export function ChartTooltipContent({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean
  payload?: any[]
  label?: string
  formatter?: (value: any, name: string) => string
}) {
  if (!active || !payload?.length) return null

  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-btn)",
      padding: "10px 14px",
      boxShadow: "var(--shadow-card)",
      fontSize: "var(--fs-xs)",
      color: "var(--text-primary)",
    }}>
      {label && (
        <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)", fontSize: "var(--fs-2xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </div>
      )}
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color, flexShrink: 0 }} />
          <span style={{ color: "var(--text-muted)", flex: 1 }}>{entry.name}</span>
          <span style={{ fontWeight: 600, fontFamily: "monospace" }}>
            {formatter ? formatter(entry.value, entry.name) : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Chart legend ─────────────────────────────────────────────────────────────

export function ChartLegendContent({ payload }: { payload?: any[] }) {
  if (!payload?.length) return null

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", justifyContent: "center", paddingTop: 8 }}>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-2xs)", color: "var(--text-muted)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: entry.color, flexShrink: 0 }} />
          {entry.value}
        </div>
      ))}
    </div>
  )
}
