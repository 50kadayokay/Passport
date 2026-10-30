#!/bin/zsh
# Save the staging connection string safely.
#   zsh scripts/save-staging-dsn.sh
#
# Reads with no echo, writes the file, then validates it WITHOUT printing it.
# Refuses a repeated paste -- the failure that leaked a password once already.
set -e
cd "$(dirname "$0")/.."
printf 'Paste the Session pooler URI (it will not be shown), then press Return:\n'
read -rs CONN
printf '%s' "$CONN" > supabase/staging/.connection
unset CONN
chmod 600 supabase/staging/.connection
node scripts/check-staging-dsn.mjs
