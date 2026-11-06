# Nový prezentačný web techscope.sk – zadanie

## Cieľ
Statický prezentačný web, ktorý privádza návštevníka k **rezervácii online stretnutia**.
Rezervácia beží na existujúcom Supabase systéme (voľné termíny → `vytvorit_rezervaciu` → Google Kalendár + Meet + e-mail cez Resend).
Nový web tento systém len prestyluje, logiku nemení.

## Štruktúra súborov
```
index.html                  NOVÝ – homepage
rezervacia.html             NOVÝ dizajn – kalendár termínov + formulár (logika prevzatá)
obchodne-podmienky.html     prestylovať, text NEMENIŤ
ochrana-udajov.html         prestylovať, text NEMENIŤ
404.html                    NOVÝ
assets/css/web.css          NOVÝ – jediný CSS súbor nového webu
assets/fonts/*.woff2        HOTOVÉ – Archivo + JetBrains Mono
assets/js/web/sloty.js      NOVÝ – karta „najbližšie voľné termíny“ v hero
assets/js/web/rezervacia.js NOVÝ – prevzatá logika z assets/js/rezervacia.js
sitemap.xml, robots.txt     aktualizovať
klient.html, admin.html …   NEMENIŤ (pozri CLAUDE.md)
```

## Homepage – sekcie a texty
Vizuál a texty sú v `docs/novy-web/dizajn-referencia.html`. Rozdiely oproti referencii:

1. **Hlavička:** logo, odkazy Služby / Postup / Referencie / Klientska zóna (→ `klient.html`), tlačidlo „Rezervovať stretnutie“ (→ `rezervacia.html`).
   Na mobile (< 760 px) odkazy schovať, ostane logo + tlačidlo.
2. **Hero:** nadpis – prvá veta modrou `#4D6BFF` („Celý náš tím robí naraz iba na jednom projekte.“), „Na vašom.“ bielou.
   Lead, tlačidlá „Rezervovať stretnutie“ (blue) a „Čo programujeme“ (white → #sluzby).
   **Namiesto kontaktného formulára** vpravo karta „Najbližšie voľné termíny“: 3 najbližšie sloty z tabuľky `call_slots`
   (`dostupny = true`, `datum >= dnes`, zoradené), každý ako odkaz na `rezervacia.html`, pod nimi tlačidlo „Všetky termíny“.
   Ak sa termíny nenačítajú alebo žiadne nie sú: text „Napíšte nám na contact@techscope.sk“ – karta nesmie nikdy ostať prázdna ani ukázať chybu.
3. **Čo programujeme:** modrý blok „Softvér na mieru“ + mriežka 5 služieb + bunka „Niečo iné?“. Tlačidlá vedú na `rezervacia.html`.
4. **Od prvého stretnutia po spustenie:** 5 krokov + tlačidlo.
5. **Medi Ready:** iba text (popis + 45 dní). **Obrázok a citát skryť**, kým nebude skutočný screenshot a citát s celým menom.
   Ak existuje `icons/mediready_logo.jpeg`, smie sa použiť ako logo klienta.
6. **Pre koho najčastejšie staviame:** modrý blok Financie + Doprava + Zdravotníctvo.
7. **Tím:** CELÚ SEKCIU zatiaľ vynechať (chýba fotka a rola). Odkaz v menu tiež.
8. **Podmienky spolupráce:** 4 body.
9. **Modrý pás s výzvou:** text + tlačidlo „Rezervovať stretnutie“.
10. **Pätička:** logo, firemné údaje (obchodné meno, sídlo, IČO – prevziať z `obchodne-podmienky.html`), contact@techscope.sk,
    odkazy, Obchodné podmienky, Ochrana osobných údajov, Klientska zóna, Prihlásenie pre tím (→ `admin.html`).

## Rezervácia
- Rovnaký tok ako dnes: kalendár → časy → formulár → potvrdenie. Všetky polia, validácie, GDPR súhlas a ošetrenie `slot_obsadeny` zachovať.
- Ponuka „O ktorú službu máte záujem?“ – nové hodnoty (stĺpec `leads.produkt` je text, DB sa nemení):
  `softver_na_mieru` Softvér na mieru · `portal` Klientsky portál · `mobilna_aplikacia` Mobilná aplikácia · `integracie` Integrácie ·
  `nahrada_systemu` Náhrada starého systému · `ai_automatizacia` Automatizácia s AI · `neurcene` Neviem ešte, poradíme sa na stretnutí
- Rozpočet: hodnoty podľa cenníka – „do 8 000 €“, „8 000 – 18 000 €“, „18 000 – 28 000 €“, „28 000 – 42 000 €“, „42 000 € a viac“, „neviem odhadnúť“.
- Žiadne `innerHTML` s hodnotami od používateľa bez escapovania (už existuje `escapeHtml`).

## SEO a technika
- `<title>`, meta description, Open Graph (`assets/img/og-image.png`), `<link rel="canonical">`, favicony z `icons/`.
- Štruktúrované dáta `Organization` (JSON-LD) s menom, URL, e-mailom.
- Žiadne externé fonty ani trackovanie v tomto kroku. Obrázky s `width`/`height`, `loading="lazy"` mimo hero.
- Musí fungovať pri šírke 375 px bez horizontálneho scrollu.
