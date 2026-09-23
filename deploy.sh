#!/usr/bin/env bash
# Word Duel one-shot deploy. Run from inside this folder:  bash deploy.sh
set -e
cd "$(dirname "$0")"
V="npx -y vercel@latest"

echo "1/4  Linking to a Vercel project called word-duel (log in if asked)"
$V link --yes --project word-duel

echo "2/4  Adding settings"
setvar () {
  $V env rm "$1" production -y >/dev/null 2>&1 || true
  printf '%s' "$2" | $V env add "$1" production >/dev/null
  echo "     $1 set"
}
setvar P1_NAME "Morgan"
setvar P2_NAME "Blake"
setvar P1_TOKEN "9K0zIUppUKcp5lgE6-TC7Qh2"
setvar P2_TOKEN "KBfy9RO3yutLhPTs83RqagFC"
setvar VAPID_PUBLIC "BIg1g1EhYefgEwksJ4sQPd3_14vYo-6ZLgWRmiH4WXaKBcZnZ4fRv2iXKXwDxR8r0qs16xFKUI0PTnfVy4en1v0"
setvar VAPID_PRIVATE "rtGH1_Josdaex4dVDrkV1HEKzFbShpGwaT6YHhcVXOY"
setvar VAPID_SUBJECT "mailto:duel@word-duel.app"
setvar CRON_SECRET "w16ucSsyx1z96LFbekgHjJUlTky0dbNV"

echo "3/4  Adding the free Neon database (pick the Free plan when asked)"
$V integration add neon || echo "     Couldn't add Neon from here. Add it in the Vercel dashboard: word-duel > Storage > Neon, then run: npx vercel deploy --prod"

echo "4/4  Deploying"
$V deploy --prod --yes

echo ""
echo "Done. Your production domain is shown in the Vercel dashboard (usually https://word-duel.vercel.app)."
echo "Morgan's link:  <domain>/?k=9K0zIUppUKcp5lgE6-TC7Qh2"
echo "Blake's link:   <domain>/?k=KBfy9RO3yutLhPTs83RqagFC"
