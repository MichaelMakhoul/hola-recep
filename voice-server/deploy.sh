#!/usr/bin/env bash
# Deploy the voice server, then force the expensive wake so a CALLER never pays it.
# Use this instead of a bare `fly deploy`.
#
# SCRUM-579: the app runs with min_machines_running = 0, so the machine stops
# when idle. Twilio's read timeout for call webhooks is hard-capped at 15s, and
# a real call landing on a slow wake falls through to the fallback URL: the
# caller hears "our system is temporarily unavailable" and a status: "failed"
# row lands in the business's call log.
#
# WHY THE STOP BELOW — measured 2026-08-23, and it is the whole point of this
# script. `fly deploy` leaves the machine STARTED, so curling /health right
# after a deploy hits a running machine in ~80ms and absorbs nothing. The
# expensive wake (~14.5s: the host re-pulls the image) lands on the FIRST wake
# after the machine subsequently autostops — i.e. on whoever calls next.
# Observed: deploy 06:19:54Z left it started; it autostopped by 06:25:14Z; the
# wake at 06:25:15Z pulled the image and took 14.5s; the next wake, image now
# host-cached, took 5.9s.
#
# So we stop it ourselves and wake it ourselves. The deploy has already
# restarted the machine at this point, so the stop costs no additional call
# disruption. (Based on one measured deploy — if a future deploy shows a pull
# at deploy time instead, this stop becomes unnecessary rather than harmful.)
set -euo pipefail

APP="${FLY_APP:-phondo-voice}"
# Derived from APP, not hardcoded: otherwise FLY_APP=phondo-voice-staging would
# deploy staging, warm PRODUCTION, and report success for an unwarmed machine.
HEALTH_URL="${VOICE_SERVER_HEALTH_URL:-https://${APP}.fly.dev/health}"

cd "$(dirname "$0")"   # fly.toml + Dockerfile live here; deploying from the repo root fails

echo "→ deploying $APP"
fly deploy -a "$APP" "$@"

echo "→ stopping $APP so the post-deploy image pull is paid here, not by a caller"
fly machine stop -a "$APP" || echo "  (stop failed — warming anyway; the wake below may be a no-op)"

echo "→ warming $APP via $HEALTH_URL"
start=$(date +%s)
# NOT curl -f: with set -e, -f aborts the script at this assignment, so the
# diagnostic below never runs and the operator sees a bare `curl: (22)`. Read as
# a failed DEPLOY, that invites a re-run — which re-pulls the image and puts the
# machine straight back on the cold path this script exists to avoid.
# `|| code="000"` catches DNS/connect/timeout, which have no HTTP status at all.
code=$(curl -sS --max-time 60 -o /dev/null -w "%{http_code}" "$HEALTH_URL") || code="000"
elapsed=$(( $(date +%s) - start ))
echo "→ warm: HTTP $code in ${elapsed}s"

if [ "$code" != "200" ]; then
  echo "✗ health check returned $code after ${elapsed}s — the deploy is LIVE but NOT verified." >&2
  echo "  Do not just re-run this: check 'fly logs -a $APP' first. A re-deploy" >&2
  echo "  re-pulls the image and puts the machine back on the cold path." >&2
  exit 1
fi

echo "✓ deployed and warm (${elapsed}s wake absorbed). Confirm the boot line: fly logs -a $APP"
