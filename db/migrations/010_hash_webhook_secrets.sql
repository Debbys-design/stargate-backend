-- Add hashed_secret column to webhooks table
ALTER TABLE webhooks
  ADD COLUMN hashed_secret TEXT;

-- Migrate existing secrets (hash them)
UPDATE webhooks
SET hashed_secret = encode(digest(secret, 'sha256'), 'hex')
WHERE hashed_secret IS NULL;

-- Make hashed_secret NOT NULL and drop secret column
ALTER TABLE webhooks
  ALTER COLUMN hashed_secret SET NOT NULL,
  DROP COLUMN secret;
