#!/bin/bash
# Сервер Timeweb: каждую минуту (cron). Если сейчас окно матча (за 40 мин до начала … конец),
# собирает live.json из телеграма и, если он изменился, кладёт в ветку «live» (force-push).
# Сайт во время матча читает этот файл через api.github.com раз в минуту.
set -u
cd /opt/sadovod-site || exit 1
exec 8>/tmp/sadovod-live.lock
flock -n 8 || exit 0
export NODE_OPTIONS=--dns-result-order=ipv4first
STATE=/var/lib/sadovod; mkdir -p $STATE

until=$(node live.js --window 2>/dev/null | sed -n 's/^until=//p')
if [ -z "$until" ]; then
  # матч только что закончился — сразу обновляем основной сайт, не дожидаясь 10-минутного запуска
  [ -f $STATE/live-on ] && rm -f $STATE/live-on && /opt/sadovod-site/server/run-update.sh >> /var/log/sadovod-update.log 2>&1
  exit 0
fi
touch $STATE/live-on

node live.js 2>&1 | sed "s/^/$(date '+%F %T') /" || exit 0
cur=$(node -e "console.log(JSON.stringify(require('./live.json').matches))")
[ "$cur" = "$(cat $STATE/live-last 2>/dev/null)" ] && exit 0

rm -rf /tmp/lv && mkdir /tmp/lv && cp live.json /tmp/lv/
( cd /tmp/lv && git init -q -b live && git add live.json \
  && git -c user.name=sadovod-bot -c user.email=actions@users.noreply.github.com commit -qm "live $(date -u +%H:%M)" \
  && git push -qf git@github.com:4el1437/sadovod-site.git live ) \
  && echo "$cur" > $STATE/live-last && echo "$(date '+%F %T') → live.json опубликован"
