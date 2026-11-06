# techscope.sk – pravidlá pre vývoj

Repo obsahuje dve veci:
1. **Prezentačný web** (statické HTML/CSS/JS, bez build kroku) – prerábame ho od nuly priamo v `main`.
2. **Existujúcu klientsku zónu** na Supabase (`klient.html`, `admin.html`) – NEMENIŤ, kým ju nenahradí Django portál.

Zadanie nového webu: `docs/novy-web/ZADANIE.md`. Vizuálna referencia: `docs/novy-web/dizajn-referencia.html`
(inline štýly sú len referencia – vo finálnom kóde patria do `assets/css/web.css`).

## Súbory, na ktoré sa NESMIE siahať
- `klient.html`, `admin.html`
- `assets/css/style.css` (používa ho klientska zóna)
- `assets/js/klient.js`, `assets/js/admin.js`, `assets/js/invoice-pdf.js`, `assets/js/supabase-client.js`
- `supabase/`, `sql/`, `.env`
- Volania Supabase v rezervácii: `rpc('vytvorit_rezervaciu', …)` a `functions.invoke('create-meet-event', …)` – názvy, parametre a tvar payloadu ostávajú presne rovnaké.

## Spôsob práce
- Jeden krok = jeden prompt z `docs/novy-web/PROMPTY.md`. Rob len to, čo krok hovorí. Ak si nie si istý, opýtaj sa.
- Žiadny framework, žiadny build, žiadne npm závislosti pre web. Čisté HTML, jeden CSS súbor, malé JS súbory bez knižníc (okrem Supabase CDN na stránkach, ktoré ho potrebujú).
- Jazyk webu: slovenčina (`<html lang="sk">`).
- Commituj lokálne po každom kroku. **Nepushuj**, kým to výslovne nepoviem – push do `main` nasadí web naživo.

## Paralelná práca (2 chaty naraz)
Každý súbor patrí jednému chatu. Do cudzích súborov nezapisuj, len ich čítaj.

**Chat A – základ a homepage**
- `assets/css/web.css` (všetky spoločné štýly vrátane hlavičky a pätičky)
- `index.html`, `assets/js/web/sloty.js`
- Ako JEDINÝ smie robiť `git commit`.

**Chat B – rezervácia a ostatné stránky**
- `rezervacia.html`, `assets/js/web/rezervacia.js`, `assets/css/rezervacia.css`
- `obchodne-podmienky.html`, `ochrana-udajov.html`, `404.html`, `sitemap.xml`, `robots.txt`
- Nikdy necommituje. Vlastné štýly píše len do `assets/css/rezervacia.css` a používa v ňom iba premenné z `web.css` (`var(--…)`).

**Spoločné názvy tried (obaja používajú presne tieto):**
`.site-header` > `.container` > `.logo` + `nav.site-nav` (odkazy `.site-nav__link`) + `.btn.btn--blue`
`.site-footer` > `.container` > `.site-footer__brand`, `.site-footer__col`, `.site-footer__legal`
`.section`, `.section--paper|--white|--ink|--blue`, `.section-head`, `.h1`, `.h2`, `.lead`,
`.btn`, `.btn--blue|--white|--dark`, `.block--blue`, `.field`, `.container`
Premenné: `--ink --paper --white --blue --blue-dark --blue-light --blue-tint --muted --body-2 --muted-dark --field --space-1..7 (8,16,24,32,48,64,96 px)`

## Dizajnový systém (dodržať presne)
- Farby: ink `#111214`, paper `#F5F4F0`, white `#FFFFFF`, blue `#2447F5`, blue-dark `#1531C4`, blue-light (na tmavom) `#4D6BFF`, blue-tint `#E6EAFE`,
  muted (na svetlom) `#55554F`, body-2 `#3A3A35`, muted (na tmavom) `#C9C9C2`, field `#E9E8E2`, placeholder-img `#E2E1DA`.
- Písmo: Archivo (variabilné, self-hosted v `assets/fonts/`). Nadpisy H1/H2 a veľké bloky: `font-stretch:125%`, `font-weight:800`, `letter-spacing:-0.02em`.
  JetBrains Mono 800 LEN v logu `<techscope_` (`<` a `_` modrou).
- Veľkosti: H1 clamp(40px,5.2vw,72px) · H2 clamp(32px,3.4vw,48px) · veľký blok 32 · malé nadpisy 20 · lead 20 · text 17 · popisky 15.
- Medzery: iba 8 / 16 / 24 / 32 / 48 / 64 / 96 px. Sekcia 96 px zvisle, pod hlavičkou sekcie 64 px. Max šírka obsahu 1248 px, bočný okraj 24 px.
- Tlačidlá: `border-radius:999px`, výška 56 px, 15 px / 600, rámik 2 px vo farbe pozadia. Hover = prehodenie farieb (pozadie ↔ text). Active = posun o 2 px dole.
  Varianty: blue (modré/biely text), white (biele/ink text), dark (ink/biely text).
- Zaoblenie: bloky a obrázky 16 px, polia formulára 8 px.
- Pozadie: „blueprint“ mriežka (1 px čiary, 64 px; v modrých blokoch 32 px biela 9 %) s maskou, ktorá ju vytráca. Hero má navyše obrovský orezaný znak `<` (#16181D).
- Odkazy bez podčiarknutia, hover = zmena farby. `:focus-visible` = 2 px modrý obrys s odsadením 4 px.

## Zakázané (AI slop)
Gradienty (fialová/modrá, gradient v texte), štítky nad nadpismi („eyebrow“), číslovanie 01/02/03, ikony v štvorčekoch, emoji,
farebné pruhy na okraji kariet, deliace čiary medzi položkami, sklenené/rozmazané karty, šum/grain, animácie pri scrollovaní,
žiar za kurzorom, dlhé pomlčky „—“ v texte, buzzwordy (inovatívny, robustný, seamless, posunúť na vyššiu úroveň…),
vymyslené čísla a vymyslené referencie/mená. Ak chýba skutočný obsah, sekciu skry, nepíš výplň.
