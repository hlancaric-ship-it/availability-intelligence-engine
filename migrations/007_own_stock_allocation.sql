-- 007: Own-stock reservation per warehouse line (procurement plan → warehouse), kept apart from units received
-- from suppliers so repeated planning runs never count the same stock twice.
ALTER TABLE fulfillment_order_lines
  ADD COLUMN IF NOT EXISTS own_stock_allocated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fulfillment_order_lines
  ADD CONSTRAINT fulfillment_order_lines_own_stock_check
  CHECK (own_stock_allocated >= 0 AND own_stock_allocated <= allocated_quantity);
