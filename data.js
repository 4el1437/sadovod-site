// =====================================================================
//  ДАННЫЕ САЙТА ФК «САДОВОД»
//  Таблицы и матчи подтягиваются автоматически (node update.js → data-auto.js).
//  Здесь — то, что заполняется руками: турниры, состав, статистика, контент.
// =====================================================================

const CLUB = {
  name: "Садовод",
  fullName: "ФК «Садовод»",
  city: "Красноярск",
  logo: "https://img.goalstream.org/img_r_186x186/public/gclub_club/b6/18/87/860b25_be72.png?c=4e99",
  telegram: "https://web.telegram.org/a/#-1001982461808",
  goalstream: "https://www.goalstream.org/club/92446934",
};

// ---------------------------------------------------------------------
//  ТУРНИРЫ. team — как команда называется в этом турнире.
//  Для нового сезона достаточно поменять seasonId / ссылки.
// ---------------------------------------------------------------------
const TOURNAMENTS = [
  {
    id: "city",
    name: "Чемпионат Красноярска · 1 лига",
    short: "Город · 1 лига",
    full: "Пенальти.РФ Чемпионат г. Красноярска по футзалу (1 лига)",
    season: "2026/27",
    team: "Садовод",
    source: "https://www.goalstream.org/season/1097848#/schedule",
    goalstream: { seasonId: 1097848, clubGid: 10237801 },
  },
  {
    id: "fbl",
    name: "ФБЛ · 2 лига",
    short: "ФБЛ · 2 лига",
    full: "Корпоративная футбольная лига (ФБЛ) — 2 дивизион",
    season: "2026/27",
    team: "СФУ", // в этом турнире играем под названием «СФУ»
    source: "https://vsport.su/football/football-corporate/2-divizion-[fbl]---korporativnaia-futbolnaia-liga-202627/",
    // vsport не пускает скрипты, поэтому страницу лиги сохраняют в браузере (Ctrl+S)
    // и загружают на GitHub в папку fbl/. Все страницы в папке объединяются, новые важнее.
    vsport: {
      dir: "fbl",
      aliases: ["Сибирский федеральный университет"], // как ещё нас называют на vsport
      urls: ["https://vsport.su/football/football-corporate/2-divizion-[fbl]---korporativnaia-futbolnaia-liga-202627/"],
    },
  },
  {
    id: "cup",
    name: "Кубок Красноярска по футзалу",
    short: "Кубок города",
    full: "Кубок города Красноярска по футзалу",
    season: "2026/27",
    team: "Садовод",
    cup: true, // кубок — без таблицы, показываем стадию
    source: "https://www.goalstream.org/season/1100650#/schedule",
    goalstream: { seasonId: 1100650, clubGid: 10237801 },
  },
];

// ---------------------------------------------------------------------
//  ТЕЛЕГРАМ-КАНАЛ: отсюда берутся голы и передачи.
//  fromPost — с какого поста считать сезон (1973 = анонс 1/16 Кубка города, 1.11.2026).
//  rules — по каким словам в анонсе матча понять турнир (проверяются по порядку).
// ---------------------------------------------------------------------
const TELEGRAM = {
  channel: "fcsadovod",
  fromPost: 1973,
  tz: 7, // Красноярск, UTC+7
  rules: [
    { t: "cup",  match: "кубок город" },
    { t: "fbl",  match: "фбл" },
    { t: "city", match: "чемпионат.{0,20}город|лиги города" },
  ],
};

// ---------------------------------------------------------------------
//  РУЧНЫЕ ПРАВКИ (важнее автоматических данных)
//  MANUAL_MATCHES — добавить или исправить матч. Совпадение по турниру + дате + сопернику.
//  MANUAL_STANDINGS — полностью заменить таблицу турнира, если парсер не справился.
// ---------------------------------------------------------------------
const MANUAL_MATCHES = [
  // { t: "fbl", date: "2026-11-15", time: "12:00", home: "СФУ", away: "Соперник", score: null, venue: "", round: "3 тур" },
];
const MANUAL_STANDINGS = {
  // fbl: [ { team: "СФУ", p: 1, w: 1, d: 0, l: 0, gf: 3, ga: 1, pts: 3 }, ... ],
};

// ---------------------------------------------------------------------
//  СОСТАВ. captain: true — капитан. pos: ВРТ вратарь, ЗАЩ защитник, ПЗ полузащитник, НАП нападающий
//  Собрано из заявки goalstream + авторов голов в телеграме. Проверьте, уберите лишних, добавьте номера.
//  Имя пишется «Имя Фамилия» — так же, как в постах канала (по нему считается статистика).
// ---------------------------------------------------------------------
const PLAYERS = [
  { num: 1   , name: "Семён Проровский",       pos: "ВРТ", photo: "img/players/prorovskiy.jpg" },
  { num: 99  , name: "Вадим Засим",            pos: "ЗАЩ", photo: "img/players/zasim.jpg" },
  { num: 81  , name: "Сергей Михаль",          pos: "ВРТ", photo: "img/players/mihal.jpg" },
  { num: 22  , name: "Ярослав Ромашин",        pos: "НАП", photo: "img/players/romashin.jpg" },
  { num: 13  , name: "Анатолий Антропов",      pos: "НАП", photo: "img/players/antropov.jpg" },
  { num: 3   , name: "Андрей Супрун",          pos: "ВРТ", photo: "img/players/suprun.jpg" },
  { num: 42  , name: "Матвей Маклаков",        pos: "НАП", photo: "img/players/maklakov.jpg" },
  { num: 25  , name: "Лев Мормель",            pos: "НАП", photo: "img/players/mormel.jpg" },
  { num: 97  , name: "Иван Обороча",           pos: "ЗАЩ", photo: "img/players/oborocha.jpg" },
  { num: 9   , name: "Максим Янгулов",         pos: "НАП", photo: "img/players/yangulov.jpg" },
  { num: 4   , name: "Степан Мельников",       pos: "НАП", photo: "img/players/melnikov.jpg" },
  { num: 14  , name: "Евгений Новиков",        pos: "НАП", photo: "img/players/novikov.jpg" },
  { num: 8   , name: "Михаил Фалькенберг",     pos: "ЗАЩ", photo: "img/players/falkinberg.jpg" },
  { num: 55  , name: "Артём Лагерев",          pos: "ВРТ", photo: "img/players/lagerev.jpg" },
  { num: 10  , name: "Александр Дьяченко",     pos: "НАП", photo: "img/players/dyachenko.jpg" },
  { num: 19  , name: "Никита Трифанов",        pos: "НАП", photo: "img/players/trifanov.jpg" },
  { num: 95  , name: "Александр Воропаев",     pos: "НАП", photo: "img/players/voropaev.jpg" },
  { num: 17  , name: "Александр Андриевич",    pos: "НАП", captain: true, photo: "img/players/andrievich.jpg" },
  { num: 7   , name: "Владислав Мурзин",       pos: "НАП", photo: "img/players/murzin.jpg" },
  { num: 52  , name: "Василий Прокофьев",      pos: "ПЗ",  photo: "img/players/prokofev.jpg" },
  { num: 12  , name: "Артур Мустафин",         pos: "ЗАЩ", photo: "img/players/mustafin.jpg" },
  { num: 11  , name: "Кирилл Герасимов",       pos: "ПЗ",  photo: "img/players/gerasimov.jpg" },
  { num: 18  , name: "Данил Скуратов",         pos: "НАП", photo: "" },
  { num: 47  , name: "Александр Бредов",       pos: "НАП", photo: "img/players/bredov.jpg" },
  { num: 23  , name: "Рамиль Халимов",         pos: "НАП", photo: "" },
  { num: 5   , name: "Андрей Пикалов",         pos: "ЗАЩ", photo: "img/players/pikalov.jpg" },
  { num: 82  , name: "Андрей Суздаль",         pos: "НАП", photo: "img/players/suzdal.jpg" },
  { num: 69  , name: "Александр Шурыгин",      pos: "НАП", photo: "img/players/shurigin.jpg" },
  { num: null, name: "Даниил Кардашов",        pos: "ЗАЩ", photo: "" },
];

// Тренеры и руководство
const STAFF = [
  { name: "Вадим Засим",      role: "Тренер",   photo: "img/players/zasim.jpg" },
  { name: "Семён Проровский", role: "Директор", photo: "img/players/prorovskiy.jpg" },
];

// ---------------------------------------------------------------------
//  СТАТИСТИКА. Голы и передачи считаются автоматически из телеграма.
//  Сюда — только поправки/дополнения (прибавляются к авто-данным),
//  например игры и жёлтые карточки: { t: "city", name: "Владислав Мурзин", games: 1, yc: 1 }
//  t — турнир ("city" / "fbl" / "cup").
// ---------------------------------------------------------------------
const PLAYER_STATS = [
];

// ---------------------------------------------------------------------
//  VK-ПАБЛИК: посты с фото, видео и клипами + фотоальбомы → страница «Контент».
//  Нужен сервисный ключ в файле vk-token.txt (см. ИНСТРУКЦИЯ.txt).
//  fromDate — с какой даты брать посты.
// ---------------------------------------------------------------------
const VK_PUBLIC = {
  screenName: "fc_sadovod",
  groupId: 214784904, // ФК «Садовод» (218166313 — это ФФГК, не путать)
  url: "https://vk.ru/fc_sadovod",
  fromDate: "2026-08-01",
};

// Свой контент (добавляется к постам из VK). type: "news" | "photo" | "video"
const CONTENT = [
  // { type: "news", date: "2026-11-15", title: "Заголовок", text: "Текст", image: "img/news/foto.jpg", link: "" },
];

// Магазин. Пока пусто — на странице заглушка «скоро».
const SHOP = [];
