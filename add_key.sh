#!/bin/bash
# This script inserts the frontend API key into the database
# Run this after the backend is running with: bash add_key.sh

PSQL_URL="postgresql://neondb_owner:npg_j7viuy5REQbO@ep-weathered-silence-a1rst99h-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
API_KEY="ak_frontend_test_key_dev_12345"

# Create user and API key
psql "$PSQL_URL" <<EOF
-- Create frontend user
INSERT INTO "User" (email, "businessName", "passwordHash", "planType", status)
VALUES ('frontend@village-api.local', 'Frontend Dashboard', '', 'UNLIMITED', 'ACTIVE')
ON CONFLICT (email) DO NOTHING;

-- Get the user ID
WITH user_data AS (
  SELECT id FROM "User" WHERE email = 'frontend@village-api.local'
)
INSERT INTO "ApiKey" (name, key, "secretHash", "userId", "isActive")
SELECT
  'Frontend Dashboard Key',
  '$API_KEY',
  '$API_KEY',
  user_data.id,
  true
FROM user_data
ON CONFLICT (key) DO NOTHING;

SELECT * FROM "ApiKey" WHERE key = '$API_KEY';
EOF
