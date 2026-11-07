-- Every uploaded document also gets a standard PDF (company header, document name, number on file, footer).
-- page_keys = the JPEG page images the standard PDF is built from (a photo = itself; an uploaded PDF = its rendered pages).
ALTER TABLE customer_files ADD COLUMN IF NOT EXISTS pdf_storage_key VARCHAR(255);
ALTER TABLE customer_files ADD COLUMN IF NOT EXISTS page_keys JSONB NOT NULL DEFAULT '[]'::jsonb;
