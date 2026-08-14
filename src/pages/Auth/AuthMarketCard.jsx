import React, { useEffect, useState } from 'react';
import { Icon } from '../../components/ui/Icon';

const MONEDAS = [
  { title: 'Dólar Blue', price: '$ 1.540,00', change: '+1,35% hoy', up: true },
  { title: 'Dólar Oficial', price: '$ 1.515,00', change: '+0,40% hoy', up: true },
  { title: 'Dólar MEP', price: '$ 1.524,00', change: '+0,90% hoy', up: true },
  { title: 'Euro', price: '$ 1.722,07', change: '+0,25% hoy', up: true },
  { title: 'Bitcoin', price: '$ 94.563.403', change: '+2,10% hoy', up: true },
  { title: 'Ethereum', price: '$ 2.820.591', change: '+1,80% hoy', up: true },
];

export default function AuthMarketCard() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % MONEDAS.length), 3000);
    return () => clearInterval(id);
  }, []);

  const moneda = MONEDAS[index];

  return (
    <div className="auth-market-card">
      <div key={index} className="mc-anim">
        <div className="mc-title">{moneda.title}</div>
        <div className="mc-price">{moneda.price}</div>
        <div className="mc-change">
          <Icon name={moneda.up ? 'trendUp' : 'trendDown'} size={14} />
          {moneda.change}
        </div>
      </div>
      <div className="mc-chart"></div>
    </div>
  );
}
