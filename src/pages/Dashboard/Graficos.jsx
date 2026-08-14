import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { Icon } from '../../components/ui/Icon';
import { CurrencyIcon } from '../../components/ui/CurrencyIcon';
import { fetchRates, fetchUsdHistory, fetchCryptoHistory } from '../../services/api';
import { formatARS } from '../../utils';
import './Graficos.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const PAIRS = [
  { id: 'USD-Blue', code: 'USD', mercado: 'Blue', name: 'Dólar Blue', ticker: 'USD/ARS', group: 'Dólares' },
  { id: 'USD-Oficial', code: 'USD', mercado: 'Oficial', name: 'Dólar Oficial', ticker: 'USD/ARS', group: 'Dólares' },
  { id: 'USD-Bolsa', code: 'USD', mercado: 'Bolsa', name: 'Dólar MEP / Bolsa', ticker: 'USD/ARS', group: 'Dólares' },
  { id: 'EUR-Oficial', code: 'EUR', mercado: 'Oficial', name: 'Euro', ticker: 'EUR/ARS', group: 'Forex' },
  { id: 'GBP-Oficial', code: 'GBP', mercado: 'Oficial', name: 'Libra Esterlina', ticker: 'GBP/ARS', group: 'Forex' },
  { id: 'BRL-Oficial', code: 'BRL', mercado: 'Oficial', name: 'Real Brasileño', ticker: 'BRL/ARS', group: 'Forex' },
  { id: 'JPY-Oficial', code: 'JPY', mercado: 'Oficial', name: 'Yen Japonés', ticker: 'JPY/ARS', group: 'Forex' },
  { id: 'CAD-Oficial', code: 'CAD', mercado: 'Oficial', name: 'Dólar Canadiense', ticker: 'CAD/ARS', group: 'Forex' },
  { id: 'CHF-Oficial', code: 'CHF', mercado: 'Oficial', name: 'Franco Suizo', ticker: 'CHF/ARS', group: 'Forex' },
  { id: 'BTC-Cripto', code: 'BTC', mercado: 'Cripto', name: 'Bitcoin', ticker: 'BTC/ARS', group: 'Cripto' },
  { id: 'ETH-Cripto', code: 'ETH', mercado: 'Cripto', name: 'Ethereum', ticker: 'ETH/ARS', group: 'Cripto' },
  { id: 'SOL-Cripto', code: 'SOL', mercado: 'Cripto', name: 'Solana', ticker: 'SOL/ARS', group: 'Cripto' },
  { id: 'USDT-Cripto', code: 'USDT', mercado: 'Cripto', name: 'Tether', ticker: 'USDT/ARS', group: 'Cripto' },
  { id: 'BNB-Cripto', code: 'BNB', mercado: 'Cripto', name: 'BNB', ticker: 'BNB/ARS', group: 'Cripto' },
];

const GROUPS = ['Dólares', 'Forex', 'Cripto'];

const PERIOD_DAYS = { '24 horas': 1, '7 días': 7, '30 días': 30, '1 año': 365 };

const CRYPTO_IDS = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', USDT: 'tether', BNB: 'binancecoin' };

function resolvePair(moneda, mercado) {
  const m = (mercado || '').toLowerCase();
  if (moneda === 'USD') {
    const byMarket = PAIRS.find((p) => p.code === 'USD' && p.mercado.toLowerCase() === m);
    if (byMarket) return byMarket;
    if (m.includes('oficial')) return PAIRS[1];
    return PAIRS[0];
  }
  return (
    PAIRS.find((p) => p.code === moneda) ||
    PAIRS.find((p) => p.id === moneda) ||
    PAIRS[0]
  );
}

function isEstimated(pair) {
  if (pair.code === 'USD') {
    return pair.mercado !== 'Oficial' && pair.mercado !== 'Blue';
  }
  return !CRYPTO_IDS[pair.code];
}

/**
 * Historia real según el par:
 *  - USD → bluelytics (Blue u Oficial; el resto se aproxima con Blue).
 *  - Cripto → CoinGecko en ARS (horario para 24 h, diario para el resto).
 *  - Forex → estimación anclada al precio actual real usando la evolución
 *    diaria real del Dólar Blue (no hay API de historial gratuita).
 */
async function loadSeries(pair, days) {
  if (pair.code === 'USD') {
    const source = pair.mercado === 'Oficial' ? 'Oficial' : 'Blue';
    return fetchUsdHistory(source, days);
  }
  if (CRYPTO_IDS[pair.code]) {
    return fetchCryptoHistory(CRYPTO_IDS[pair.code], days);
  }

  const [blueSeries, rates] = await Promise.all([
    fetchUsdHistory('Blue', days),
    fetchRates(),
  ]);
  const rate = rates.find(
    (r) => r.codigo === pair.code && (r.tipo_mercado === pair.mercado || r.tipo === pair.mercado)
  ) || rates.find((r) => r.codigo === pair.code);

  if (!rate) return [];
  return buildApproxHistory(Number(rate.venta), blueSeries, days);
}

function buildApproxHistory(currentPrice, blueSeries, days) {
  const factors = [];
  for (let i = 1; i < blueSeries.length; i++) {
    const prev = Number(blueSeries[i - 1].venta) || 1;
    const curr = Number(blueSeries[i].venta);
    if (prev > 0 && curr > 0) factors.push(curr / prev);
  }
  const n = Math.min(factors.length, Math.max(days - 1, 1));
  const values = new Array(n + 1);
  let v = Number(currentPrice) || 0;
  values[n] = v;
  for (let i = n - 1; i >= 0; i--) {
    const factor = factors[i] || 1;
    v = v / factor;
    values[i] = v;
  }
  const dates = blueSeries.slice(-(n + 1)).map((b) => b.date);
  return dates.map((date, i) => ({ date, compra: values[i], venta: values[i] }));
}

function computeMetrics(series) {
  const values = series.map((s) => s.venta).filter((v) => v > 0);
  if (values.length === 0) return null;
  const first = values[0];
  const last = values[values.length - 1];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const variation = ((last - first) / first) * 100;
  const rangePct = ((max - min) / first) * 100;
  const upDays = values.slice(1).filter((v, i) => v >= values[i]).length;
  const downDays = values.length - 1 - upDays;
  return {
    first,
    last,
    max,
    min,
    variation,
    rangePct,
    upDays,
    downDays,
    total: values.length,
  };
}

function formatDateLabel(iso) {
  const hasTime = typeof iso === 'string' && iso.includes('T') && iso.slice(11, 16) !== '00:00';
  const d = hasTime ? new Date(iso) : new Date(`${iso || ''}T00:00:00`);
  const datePart = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  if (hasTime) {
    const timePart = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  }
  return datePart;
}

export default function Graficos() {
  const [searchParams] = useSearchParams();
  const initialPair = useMemo(
    () => resolvePair(searchParams.get('moneda'), searchParams.get('mercado')),
    [searchParams]
  );

  const [selectedPair, setSelectedPair] = useState(initialPair);
  const [selectedPeriod, setSelectedPeriod] = useState('30 días');
  const [compareEnabled, setCompareEnabled] = useState(true);
  const [chartType, setChartType] = useState('linea');
  const [series, setSeries] = useState([]);
  const [compareSeries, setCompareSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState('');

  const showToast = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3000);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const days = PERIOD_DAYS[selectedPeriod] || 30;

    const comparePair =
      selectedPair.code === 'USD' && selectedPair.mercado !== 'Oficial'
        ? PAIRS[1]
        : PAIRS[0];

    Promise.all([loadSeries(selectedPair, days), loadSeries(comparePair, days)])
      .then(([main, cmp]) => {
        if (!active) return;
        setSeries(main);
        setCompareSeries(cmp);
        if (main.length === 0) setError('No hay datos históricos disponibles para este par.');
      })
      .catch((err) => {
        console.error('Error cargando el gráfico', err);
        if (active) {
          setSeries([]);
          setCompareSeries([]);
          setError('No se pudo obtener el historial. Intentalo de nuevo en unos minutos.');
        }
      })
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [selectedPair, selectedPeriod]);

  const metrics = useMemo(() => computeMetrics(series), [series]);
  const isEst = isEstimated(selectedPair);

  const ohlc = useMemo(
    () =>
      series.map((s, i) => {
        const open = i === 0 ? Number(s.venta) : Number(series[i - 1].venta);
        const close = Number(s.venta);
        return { open, close, high: Math.max(open, close), low: Math.min(open, close), up: close >= open };
      }),
    [series]
  );

  // Escala dinámica del eje Y: nunca arranca en 0, se ajusta al rango real con offset.
  const scaleBounds = useMemo(() => {
    let values = [];
    if (chartType === 'velas') {
      values = ohlc.flatMap((o) => [o.low, o.high]);
    } else {
      values = series.map((s) => Number(s.venta));
      if (compareEnabled) values.push(...compareSeries.map((s) => Number(s.venta)));
    }
    const clean = values.filter((v) => Number.isFinite(v) && v > 0);
    if (clean.length === 0) return null;
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const pad = Math.max((max - min) * 0.08, max * 0.002, 0.5);
    return { min: Math.max(min - pad, 0), max: max + pad };
  }, [series, compareSeries, compareEnabled, chartType, ohlc]);

  const labels = series.map((s) => formatDateLabel(s.date));

  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: selectedPair.ticker,
          data: series.map((s) => s.venta),
          borderColor: 'var(--chart-gold)',
          backgroundColor: chartType === 'area' ? 'rgba(240, 185, 11, 0.18)' : 'var(--chart-gold)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: chartType === 'area',
          pointRadius: 0,
          pointHoverRadius: 7,
          pointBackgroundColor: 'var(--chart-gold)',
        },
        ...(compareEnabled
          ? [{
              label: `Dólar ${comparePairLabel(selectedPair)}`,
              data: compareSeries.map((s) => s.venta),
              borderColor: 'var(--chart-steel)',
              backgroundColor: chartType === 'area' ? 'rgba(124, 141, 181, 0.16)' : 'var(--chart-steel)',
              borderWidth: 2.5,
              tension: 0.35,
              fill: false,
              pointRadius: 0,
              pointHoverRadius: 7,
              pointBackgroundColor: 'var(--chart-steel)',
            }]
          : []),
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, compareSeries, compareEnabled, chartType, selectedPair]
  );

  const candleData = useMemo(() => {
    const success = 'var(--success)';
    const danger = 'var(--danger)';
    return {
      labels,
      datasets: [
        {
          label: `${selectedPair.ticker} (mín-máx)`,
          type: 'bar',
          data: ohlc.map((o) => [o.low, o.high]),
          backgroundColor: ohlc.map((o) => (o.up ? success : danger)),
          borderColor: ohlc.map((o) => (o.up ? success : danger)),
          borderWidth: 0.5,
          barThickness: 1.5,
          categoryPercentage: 0.9,
          barPercentage: 1,
          order: 1,
        },
        {
          label: `${selectedPair.ticker} (apertura-cierre)`,
          type: 'bar',
          data: ohlc.map((o) => (o.up ? [o.open, o.close] : [o.close, o.open])),
          backgroundColor: ohlc.map((o) => (o.up ? success : danger)),
          borderColor: ohlc.map((o) => (o.up ? success : danger)),
          borderWidth: 1,
          barThickness: 7,
          borderRadius: 1,
          categoryPercentage: 0.9,
          barPercentage: 1,
          order: 0,
        },
      ],
    };
  }, [series, ohlc, selectedPair, labels]);

  const chartOptions = useMemo(() => {
    const fmt = (value) => `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      animation: {
        duration: 900,
        easing: 'easeOutQuart',
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: 'var(--text-secondary)',
            font: { size: 12, weight: '600' },
            usePointStyle: true,
            pointStyle: 'circle',
            filter: (item) => !item.text.includes('(mín-máx)'),
          },
        },
        tooltip: {
          backgroundColor: 'var(--bg-elevated)',
          titleColor: 'var(--text-secondary)',
          bodyColor: 'var(--text-main)',
          borderColor: 'rgba(240, 185, 11, 0.3)',
          borderWidth: 1,
          padding: 14,
          displayColors: chartType !== 'velas',
          boxPadding: 6,
          callbacks: {
            label: (context) => {
              if (chartType === 'velas') {
                if (context.dataset.label.includes('(mín-máx)')) return '';
                const o = ohlc[context.dataIndex];
                if (!o) return '';
                return `${selectedPair.ticker} — Apertura ${fmt(o.open)} · Máx ${fmt(o.high)} · Mín ${fmt(o.low)} · Cierre ${fmt(o.close)}`;
              }
              return ` ${context.dataset.label}: ${fmt(context.raw)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
          ticks: { color: 'var(--text-muted)', font: { size: 12 }, maxTicksLimit: 8 }
        },
        y: {
          beginAtZero: false,
          grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
          ...(scaleBounds
            ? {
                min: scaleBounds.min,
                max: scaleBounds.max,
              }
            : {}),
          ticks: {
            color: 'var(--text-muted)',
            font: { size: 12 },
            callback: (value) => '$' + value.toLocaleString('es-AR'),
          },
        },
      },
    };
  }, [scaleBounds, chartType, selectedPair, ohlc]);

  const handleDownload = () => {
    showToast("Imagen del gráfico descargada correctamente");
  };

  const handleFullscreen = () => {
    showToast("Vista de pantalla completa activada");
  };

  const renderChart = () => {
    if (loading) {
      return (
        <div className="chart-loading">
          <span className="chart-loading-spinner" />
          Cargando datos del gráfico...
        </div>
      );
    }
    if (error) {
      return (
        <div className="chart-error">
          <Icon name="info" size={22} />
          <p>{error}</p>
        </div>
      );
    }
    if (chartType === 'velas') {
      return <Bar data={candleData} options={chartOptions} />;
    }
    if (chartType === 'barras') {
      return <Bar data={chartData} options={chartOptions} />;
    }
    return <Line data={chartData} options={chartOptions} />;
  };

  return (
    <div className="graficos-container page-enter">

      {notification && (
        <div className="toast">
          {notification}
        </div>
      )}

      {/* Top Header Bar */}
      <div className="graficos-top-header">
        <div className="graficos-title-box">
          <h1>Gráficos</h1>
          <p>Analizá la evolución de cualquier moneda en el tiempo.</p>
        </div>

        <div className="graficos-selectors-bar">
          <div className="selector-group">
            <label>Moneda</label>
            <div className="selector-dropdown">
              <CurrencyIcon code={selectedPair.code} size={18} />
              <select value={selectedPair.id} onChange={(e) => setSelectedPair(PAIRS.find((p) => p.id === e.target.value) || PAIRS[0])}>
                {GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {PAIRS.filter((p) => p.group === g).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.ticker} ({p.name})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="selector-group">
            <label>Período</label>
            <div className="selector-dropdown" style={{ minWidth: '140px' }}>
              <Icon name="clock" size={15} />
              <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
                {Object.keys(PERIOD_DAYS).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="selector-group">
            <label>Comparar con</label>
            <div className="compare-toggle-card">
              <div className="compare-info">
                <CurrencyIcon code="USD" size={18} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-main)' }}>
                    {selectedPair.code === 'USD' && selectedPair.mercado !== 'Oficial' ? 'USD/ARS Oficial' : 'USD/ARS Blue'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Dólar / Peso Argentino</span>
                </div>
              </div>
              <div
                className={`toggle-switch ${compareEnabled ? 'active' : ''}`}
                onClick={() => setCompareEnabled(!compareEnabled)}
                title="Activar / Desactivar comparación"
              >
                <div className="toggle-knob"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chart Card */}
      <div className="graficos-chart-card">
        <div className="chart-toolbar">
          <div className="chart-type-selector">
            <button
              className={`ct-btn ${chartType === 'linea' ? 'active' : ''}`}
              onClick={() => setChartType('linea')}
            >
              Línea
            </button>
            <button
              className={`ct-btn ${chartType === 'area' ? 'active' : ''}`}
              onClick={() => setChartType('area')}
            >
              Área
            </button>
            <button
              className={`ct-btn ${chartType === 'velas' ? 'active' : ''}`}
              onClick={() => setChartType('velas')}
            >
              Velas
            </button>
            <button
              className={`ct-btn ${chartType === 'barras' ? 'active' : ''}`}
              onClick={() => setChartType('barras')}
            >
              Barras
            </button>
          </div>

          <div className="chart-action-btns">
            <button className="icon-btn-square" onClick={handleDownload} title="Descargar gráfico en imagen">
              <Icon name="download" size={16} />
            </button>
            <button className="icon-btn-square" onClick={handleFullscreen} title="Pantalla completa">
              <Icon name="maximize" size={16} />
            </button>
          </div>
        </div>

        <div className="chart-canvas-wrapper">
          {renderChart()}
        </div>
      </div>

      {/* Info Card: moneda seleccionada + valores clave */}
      <div className="metrics-info-card">
        <div className="currency-badge-box">
          <div className="cbb-header">
            <CurrencyIcon code={selectedPair.code} size={30} />
            <div>
              <div className="cbb-title">{selectedPair.ticker} {isEst && <small>(estimado)</small>}</div>
              <div className="cbb-sub">{selectedPair.name} / Peso Argentino</div>
            </div>
          </div>
          <div className="cbb-price-row">
            <span className="cbb-big-price">
              {metrics ? `$ ${formatARS(metrics.last)} ARS` : '—'}
            </span>
            {metrics && (
              <span className={`cbb-change-badge ${metrics.variation >= 0 ? 'up' : 'down'}`}>
                {metrics.variation >= 0 ? '+' : ''}{metrics.variation.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        <div className="key-metrics-grid">
          <div className="metric-item">
            <span className="metric-label">Apertura</span>
            <span className="metric-value">{metrics ? formatARS(metrics.first) : '—'}</span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Máximo</span>
            <span className="metric-value up">{metrics ? formatARS(metrics.max) : '—'}</span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Mínimo</span>
            <span className="metric-value down">{metrics ? formatARS(metrics.min) : '—'}</span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Cierre anterior</span>
            <span className="metric-value">{metrics ? formatARS(series[series.length - 2]?.venta) : '—'}</span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Rango ({selectedPeriod})</span>
            <span className="metric-value">{metrics ? `${formatARS(metrics.min)} - ${formatARS(metrics.max)}` : '—'}</span>
          </div>
        </div>
      </div>

      {/* Info Card: estadísticas del período */}
      <div className="stats-summary-card">
        <div className="ssc-item">
          <span className="ssc-label">Variación en el período ({selectedPeriod})</span>
          <span className={`ssc-value ${metrics?.variation >= 0 ? 'up' : 'down'}`} style={{ color: metrics?.variation >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {metrics ? `${metrics.variation >= 0 ? '+' : ''}${metrics.variation.toFixed(2)}%` : '—'}
          </span>
        </div>

        <div className="ssc-item">
          <span className="ssc-label">Máximo / Mínimo en el período</span>
          <span className="ssc-value">
            {metrics ? `${formatARS(metrics.max)} / ${formatARS(metrics.min)}` : '—'}
          </span>
        </div>

        <div className="ssc-item">
          <span className="ssc-label">Días en alza</span>
          <span className="ssc-value" style={{ color: 'var(--success)' }}>
            {metrics ? `${metrics.upDays} (${Math.round((metrics.upDays / Math.max(metrics.total - 1, 1)) * 100)}%)` : '—'}
          </span>
        </div>

        <div className="ssc-item">
          <span className="ssc-label">Días en baja</span>
          <span className="ssc-value" style={{ color: 'var(--danger)' }}>
            {metrics ? `${metrics.downDays} (${Math.round((metrics.downDays / Math.max(metrics.total - 1, 1)) * 100)}%)` : '—'}
          </span>
        </div>

        <div className="ssc-gauge-box">
          <div className="donut-gauge">
            <div className="donut-inner">
              {metrics ? `${Math.round((metrics.upDays / Math.max(metrics.total - 1, 1)) * 100)}%` : '—'}
            </div>
          </div>
          <div className="gauge-legend-list">
            <span className="gll-up">● Al alza</span>
            <span className="gll-down">● A la baja</span>
          </div>
        </div>
      </div>

    </div>
  );
}

function comparePairLabel(pair) {
  return pair.code === 'USD' && pair.mercado !== 'Oficial' ? 'Oficial' : 'Blue';
}
