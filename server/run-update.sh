#!/bin/bash
# Сервер Timeweb: каждые 10 минут (cron) собирает данные и пушит их в GitHub.
# Пуш в main сам запускает публикацию сайта (.github/workflows/update.yml).
# Код на сервере не правится — всегда берём свежий main с GitHub.
# всё тело в { … exit; } — bash читает его целиком до запуска, поэтому git reset,
# обновляющий этот же файл посреди работы, не ломает текущий прогон
{
set -u
cd /opt/sadovod-site || exit 1
exec 9>/tmp/sadovod-update.lock
flock -n 9 || { echo "$(date '+%F %T') прошлый запуск ещё идёт"; exit 0; }
export NODE_OPTIONS=--dns-result-order=ipv4first

echo "=== $(date '+%F %T')"
git fetch -q origin main && git reset -q --hard origin/main || exit 1
cmp -s package.json .deps-installed 2>/dev/null || { npm install --no-audit --no-fund --silent && cp package.json .deps-installed; }

mkdir -p /var/lib/sadovod
node update.js > /tmp/sadovod-update.out 2>&1; rc=$?
grep -v '^   повтор' /tmp/sadovod-update.out
[ $rc -eq 0 ] && date -u +%FT%TZ > /var/lib/sadovod/checked

# коммитим, только если поменялись данные сайта (кэш телеграма сам по себе — не повод)
if ! git diff --quiet -- data-auto.js lineups.json; then
  git add data-auto.js lineups.json tg-cache.json
  git -c user.name=sadovod-bot -c user.email=actions@users.noreply.github.com \
    commit -qm "Обновление данных $(date '+%Y-%m-%d %H:%M')" && git push -q origin main && echo "→ запушено"
fi

# сайт fcsadovod.ru (nginx на этом сервере) — пересобираем каждый прогон (доли секунды),
# чтобы на сайте было время последней проверки, а не последнего изменения данных
bash server/build-site.sh && echo "→ сайт пересобран"
exit 0
}
