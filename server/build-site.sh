#!/bin/bash
# Собирает сайт для nginx (fcsadovod.ru) — то же, что шаг «Подготовка сайта» в update.yml.
# Вызывается из run-update.sh после каждого прогона. Выкладка атомарная: новая папка → смена ссылки.
set -eu
cd /opt/sadovod-site
WWW=/var/www/fcsadovod
NEW=$WWW/build-$(date +%s)
mkdir -p $NEW
cp *.html *.css *.js $NEW/
cp -r img $NEW/
rm -f $NEW/update.js $NEW/live.js
# версия в ссылках меняется только при изменении самих файлов — иначе браузеры зря качают заново
V=$(cat app.js data.js data-auto.js style.css | md5sum | cut -c1-10)
for f in app.js data.js data-auto.js style.css; do
  sed -i "s|\"$f\"|\"$f?v=$V\"|g" $NEW/*.html
done
ln -sfn $NEW $WWW/current.tmp && mv -T $WWW/current.tmp $WWW/current
# старые сборки — оставляем две последние
ls -1d $WWW/build-* | sort | head -n -2 | xargs -r rm -rf
