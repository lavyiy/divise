-- ============================================================
-- Migration: 003_queries_sprint2.sql
-- Fecha:     2026-08-14
-- Descripción: Índices compuestos para soportar las consultas
--              del Sprint 2 (historial, última cotización, variación).
-- ============================================================

-- Última cotización / variación por (divisa, mercado)
CREATE INDEX IF NOT EXISTS idx_tc_divisa_mercado_fecha
  ON tipos_de_cambio (id_divisa, tipo_mercado, fecha_actualizacion DESC, id_tipo_cambio DESC);

-- Historial de cotizaciones por divisa (sin filtro de mercado)
CREATE INDEX IF NOT EXISTS idx_tc_divisa_fecha
  ON tipos_de_cambio (id_divisa, fecha_actualizacion DESC, id_tipo_cambio DESC);

-- Historial de consultas: usuario + fecha descendente
CREATE INDEX IF NOT EXISTS idx_historial_usuario_fecha
  ON historial_de_consultas (id_usuario, fecha DESC);
