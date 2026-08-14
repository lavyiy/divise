// ── src/components/ui/CurrencyIcon.jsx ───────────────────────────────────────
// Íconos SVG minimalistas (isotipo financiero en círculo con degradado) para
// divisas FIAT y criptomonedas. Reemplaza por completo los emojis de bandera.

import React, { useId } from 'react';

const ASSETS = {
  USD:  { from: '#0F9D58', to: '#0B7A44', symbol: '$' },
  ARS:  { from: '#5BA8E8', to: '#3B82C4', symbol: '$' },
  EUR:  { from: '#3A7DDA', to: '#2A5BB8', symbol: '€' },
  GBP:  { from: '#5C4D9E', to: '#3E3280', symbol: '£' },
  JPY:  { from: '#E5484D', to: '#C03337', symbol: '¥' },
  CAD:  { from: '#E5484D', to: '#C03337', symbol: 'C$' },
  CHF:  { from: '#E5484D', to: '#C03337', symbol: 'CHF' },
  BRL:  { from: '#34B34A', to: '#238B36', symbol: 'R$' },
  UYU:  { from: '#2F9DE8', to: '#1F7FBF', symbol: '$' },
  CLP:  { from: '#D64545', to: '#B03232', symbol: '$' },
  AUD:  { from: '#C94B4B', to: '#A63A3A', symbol: 'A$' },
  BTC:  { from: '#F7931A', to: '#D97B0E', symbol: '₿' },
  ETH:  { from: '#627EEA', to: '#4B62C7', symbol: 'Ξ' },
  SOL:  { from: '#9945FF', to: '#14F195', symbol: '◎' },
  USDT: { from: '#26A17B', to: '#1C7A5D', symbol: '₮' },
  BNB:  { from: '#F3BA2F', to: '#C99C20', symbol: 'BNB' },
  DEF:  { from: '#5F6D88', to: '#45536B', symbol: '$' },
};

function fontSizeFor(symbol) {
  if (symbol.length >= 3) return 13;
  if (symbol.length === 2) return 15;
  return 18;
}

/**
 * Ícono circular de moneda.
 * @param {string} code  Código ISO (USD, EUR, BTC, ...)
 * @param {number} size  Tamaño en px
 */
export function CurrencyIcon({ code = '', size = 20, className = '' }) {
  const uid = useId().replace(/[:]/g, '');
  const meta = ASSETS[code] || ASSETS.DEF;
  const label = code || 'moneda';

  return (
    <svg
      className={`currency-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={`cur-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={meta.from} />
          <stop offset="100%" stopColor={meta.to} />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="18.5" fill={`url(#cur-${uid})`} />
      <circle
        cx="20"
        cy="20"
        r="18.5"
        fill="none"
        stroke="rgba(255, 255, 255, 0.35)"
        strokeWidth="1"
      />
      <text
        x="20"
        y="20.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#FFFFFF"
        fontSize={fontSizeFor(meta.symbol)}
        fontWeight="800"
        fontFamily="'Segoe UI', system-ui, -apple-system, sans-serif"
        letterSpacing="-0.5"
      >
        {meta.symbol}
      </text>
    </svg>
  );
}

export default CurrencyIcon;
