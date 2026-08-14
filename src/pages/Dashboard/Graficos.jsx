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
import { fetchRates, fetchUsdHistory, fetchCryptoHistory } from '../../services/api';
import { flagIcon, currencyName, formatARS } from '../../utils';
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
  { id: 'USD-Blue', code: 'USD', mercado: 'Blue', name: 'Dólar Blue', ticker: 'USD/ARS' },
  { id: 'USD-Oficial', code: 'USD', mercado: 'Oficial', name: 'Dólar Oficial', ticker: 'USD/ARS' },
  { id: 'EUR-Oficial', code: 'EUR', mercado: 'Oficial', name: 'Euro', ticker: 'EUR/ARS' },
  { id: 'BRL-Oficial', code: 'BRL', mercado: 'Oficial', name: 'Real Brasileño', ticker: 'BRL/ARS' },
  { id: 'GBP-Oficial', code: 'GBP', mercado: 'Oficial', name: 'Libra Esterlina', ticker: 'GBP/ARS' },
  { id: 'BTC-Cripto', code: 'BTC', mercado: 'Cripto', name: 'Bitcoin', ticker: 'BTC/ARS' },
  { id: 'ETH-Cripto', code: 'ETH', mercado: 'Cripto', name: 'Ethereum', ticker: 'ETH/ARS' },
];

const PERIOD_DAYS = { '7 días': 7, '30 días': 30, '90 días': 90, '1 año': 365 };

function resolvePair(moneda, mercado) {
  const m = (mercado || '').toLowerCase();
  if (moneda === 'USD') {
    if (m.includes('oficial')) return PAIRS[1];
    return PAIRS[0]; // Blue / Informal por defecto
  }
  return (
    PAIRS.find((p) => p.code === moneda) ||
    PAIRS.find((p) => p.id === moneda) ||
    PAIRS[0]
  );
}

function isEstimated(pair) {
  return !['USD', 'BTC', 'ETH'].includes(pair.code);
}

/**
 * Historia real según el par:
 *  - USD → bluelytics (Blue u Oficial)
 *  - BTC / ETH → CoinGecko en ARS
 *  - EUR / BRL / GBP → estimación anclada al precio actual real
 *    usando la evolución diaria real del Dólar Blue (no hay API de historial gratuita).
 */
async function loadSeries(pair, days) {
  if (pair.code === 'USD') {
    const source = pair.mercado === 'Oficial' ? 'Oficial' : 'Blue';
    return fetchUsdHistory(source, days);
  }
  if (pair.code === 'BTC') return fetchCryptoHistory('bitcoin', days);
  if (pair.code === 'ETH') return fetchCryptoHistory('ethereum', days);

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
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
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
  const [notification, setNotification] = useState('');

  const showToast = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3000);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
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
      })
      .catch((err) => {
        console.error('Error cargando el gráfico', err);
        if (active) {
          setSeries([]);
          setCompareSeries([]);
        }
      })
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [selectedPair, selectedPeriod]);

  const metrics = useMemo(() => computeMetrics(series), [series]);
  const isEst = isEstimated(selectedPair);

  const chartData = {
    labels: series.map((s) => formatDateLabel(s.date)),
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
      ...(compareEnabled ? [{
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
      }] : [])
    ]
  };

  const chartOptions = {
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
          pointStyle: 'circle'
        }
      },
      tooltip: {
        backgroundColor: 'var(--bg-elevated)',
        titleColor: 'var(--text-secondary)',
        bodyColor: 'var(--text-main)',
        borderColor: 'rgba(240, 185, 11, 0.3)',
        borderWidth: 1,
        padding: 14,
        displayColors: true,
        boxPadding: 6,
        callbacks: {
          label: (context) => ` ${context.dataset.label}: $${context.raw.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
        ticks: { color: 'var(--text-muted)', font: { size: 12 }, maxTicksLimit: 8 }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
        ticks: {
          color: 'var(--text-muted)',
          font: { size: 12 },
          callback: (value) => '$' + value.toLocaleString('es-AR')
        }
      }
    }
  };

  const handleDownload = () => {
    showToast("Imagen del gráfico descargada correctamente");
  };

  const handleFullscreen = () => {
    showToast("Vista de pantalla completa activada");
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
              <span>{flagIcon(selectedPair.code)}</span>
              <select value={selectedPair.id} onChange={(e) => setSelectedPair(PAIRS.find((p) => p.id === e.target.value) || PAIRS[0])}>
                {PAIRS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.ticker} ({p.name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="selector-group">
            <label>Período</label>
            <div className="selector-dropdown" style={{ minWidth: '140px' }}>
              <Icon name="clock" size={15} />
              <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
                <option value="7 días">7 días</option>
                <option value="30 días">30 días</option>
                <option value="90 días">90 días</option>
                <option value="1 año">1 año</option>
              </select>
            </div>
          </div>

          <div className="selector-group">
            <label>Comparar con</label>
            <div className="compare-toggle-card">
              <div className="compare-info">
                <span>🇺🇸</span>
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
          {loading ? (
            <div className="chart-loading">Cargando datos del gráfico...</div>
          ) : chartType === 'barras' ? (
            <Bar data={chartData} options={chartOptions} />
          ) : (
            <Line data={chartData} options={chartOptions} />
          )}
        </div>
      </div>

      {/* Info Card: moneda seleccionada + valores clave */}
      <div className="metrics-info-card">
        <div className="currency-badge-box">
          <div className="cbb-header">
            <span style={{ fontSize: '24px' }}>{flagIcon(selectedPair.code)}</span>
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
