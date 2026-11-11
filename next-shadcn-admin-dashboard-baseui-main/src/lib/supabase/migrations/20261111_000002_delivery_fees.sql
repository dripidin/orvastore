-- Live EcoTrack delivery tariffs cache (synced from GET /api/v1/get/fees)
CREATE TABLE IF NOT EXISTS delivery_fees (
  wilaya_id INTEGER NOT NULL,
  service_type TEXT NOT NULL DEFAULT 'ecotrack',
  tarif_domicile NUMERIC NOT NULL DEFAULT 0,
  tarif_stopdesk NUMERIC NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wilaya_id, service_type)
);

ALTER TABLE delivery_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Delivery fees are readable" ON delivery_fees;
CREATE POLICY "Delivery fees are readable" ON delivery_fees FOR SELECT USING (true);

