#!/usr/bin/env bash
# Deploy the voice server, then WARM it. Use this instead of a bare `fly deploy`.
#
# SCRUM-579: the app runs with min_machines_running = 0, so the machine stops
# when idle. The first wake after a deploy re-pulls the image onto the host and
# measured ~14.5s. Twilio's read timeout for call webhooks is hard-capped at
# 15s, so a real call landing on that first wake falls through to the fallback
# URL: the caller hears "our system is temporarily unavailable" and a
# status: "failed" row lands in the business's call log.
#
# The warm below absorbs that wake so a caller never pays it, and doubles as a
# smoke test of the image just deployed. It is not optional — which is why it
# lives in a script rather than as a line in the runbook someone can skip.
set -euo pipefail

APP="${FLY_APP:-phondo-voice}"
HEALTH_URL="${VOICE_SERVER_HEALTH_URL:-https://phondo-voice.fly.dev/health}"

cd "$(dirname "$0")"   # fly.toml + Dockerfile live here; deploying from the repo root fails

echo "→ deploying $APP"
fly deploy -a "$APP" "$@"

echo "→ warming $APP (absorbing the post-deploy image pull)"
start=$(date +%s)
code=$(curl -fsS --max-time 45 -o /dev/null -w "%{http_code}" "$HEALTH_URL")
elapsed=$(( $(date +%s) - start ))
echo "→ warm: HTTP $code in ${elapsed}s"

if [ "$code" != "200" ]; then
  echo "✗ health check returned $code — the deploy is live but NOT verified" >&2
  exit 1
fi

echo "✓ deployed and warm. Confirm the boot line in: fly logs -a $APP"
