-- Migración de soporte para perfil comercial avanzado, frecuencia inteligente y adjuntos
ALTER TABLE providers ADD COLUMN IF NOT EXISTS department VARCHAR(255);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS zone VARCHAR(255);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS certificate_file_name VARCHAR(255);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS traceability_file_name VARCHAR(255);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS frequency_mode VARCHAR(50) DEFAULT 'automatic';

ALTER TABLE provider_materials ADD COLUMN IF NOT EXISTS frequency_mode VARCHAR(50) DEFAULT 'automatic';
ALTER TABLE provider_materials ADD COLUMN IF NOT EXISTS average_days NUMERIC(10,2);
ALTER TABLE provider_materials ADD COLUMN IF NOT EXISTS total_deliveries INTEGER DEFAULT 0;
ALTER TABLE provider_materials ADD COLUMN IF NOT EXISTS last_delivery_date TIMESTAMPTZ;
ALTER TABLE provider_materials ADD COLUMN IF NOT EXISTS next_estimated_date TIMESTAMPTZ;

ALTER TABLE provider_bank_accounts ADD COLUMN IF NOT EXISTS qr_file_name VARCHAR(255);
ALTER TABLE provider_bank_accounts ADD COLUMN IF NOT EXISTS qr_original_name VARCHAR(255);
