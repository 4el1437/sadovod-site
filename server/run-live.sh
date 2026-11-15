#!/bin/bash
# Сервер Timeweb: каждую минуту (cron). Если сейчас окно матча (за 40 мин до начала … конец),
# собирает live.json из телеграма каждые ~15 секунд:
#  - кладёт его на fcsadovod.ru/live.json (сайт на своём домене читает его раз в 15 с);
#  - если изменился — в ветку «live» на GitHub (для зеркала github.io, читает через api.github.com).
# всё тело в { … exit; } — bash читает его целиком до запуска, поэтому git reset,
# обновляющий этот же файл посреди работы, не ломает текущий прогон
{
set -u
cd /opt/sadovod-site || exit 1
exec 8>/tmp/sadovod-live.lock
flock -n 8 || exit 0
export NODE_OPTIONS=--dns-result-order=ipv4first
STATE=/var/lib/sadovod; mkdir -p $STATE
WWW=/var/www/fcsadovod

until=$(node live.js --window 2>/dev/null | sed -n 's/^until=//p')
if [ -z "$until" ]; then
  # матч только что закончился — сразу обновляем основной сайт, не дожидаясь 10-минутного запуска
  [ -f $STATE/live-on ] && rm -f $STATE/live-on && /opt/sadovod-site/server/run-update.sh >> /var/log/sadovod-update.log 2>&1
  exit 0
fi
touch $STATE/live-on

start=$(date +%s)
while :; do
  t0=$(date +%s)
  node live.js > /tmp/sadovod-live.out 2>&1; rc=$?
  grep -v '^   повтор' /tmp/sadovod-live.out | sed "s/^/$(date '+%F %T') /"
  if [ $rc -eq 0 ]; then
    # свой сервер — сразу (атомарно: временный файл → mv)
    cp live.json $WWW/live.json.tmp && mv -f $WWW/live.json.tmp $WWW/live.json
    cur=$(node -e "console.log(JSON.stringify(require('./live.json').matches))")
    if [ "$cur" != "$(cat $STATE/live-last 2>/dev/null)" ]; then
      rm -rf /tmp/lv && mkdir /tmp/lv && cp live.json /tmp/lv/
      ( cd /tmp/lv && git init -q -b live && git add live.json \
        && git -c user.name=sadovod-bot -c user.email=actions@users.noreply.github.com commit -qm "live $(date -u +%H:%M)" \
        && git push -qf git@github.com:4el1437/sadovod-site.git live ) \
        && echo "$cur" > $STATE/live-last && echo "$(date '+%F %T') → live.json опубликован"
    fi
  fi
  # следующий круг через 15 с от начала этого; в минуту не больше ~45 с — дальше подхватит следующий cron
  next=$((t0 + 15))
  [ $((next - start)) -gt 45 ] && break
  now=$(date +%s); [ $next -gt $now ] && sleep $((next - now))
done
exit 0
}
