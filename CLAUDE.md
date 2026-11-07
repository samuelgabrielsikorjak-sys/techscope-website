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

## Dizajnový systém (od 7. 11. 2026: „glass + gradient“, inšpirácia Stripe)
Zdroj pravdy je `assets/css/web.css`. Nové štýly patria tam, nie inline.
- Písmo: Inter Tight (variabilné, self-hosted v `assets/fonts/`), nadpisy hrúbka 600 s tesným rozostupom. JetBrains Mono 800 LEN v logu.
- Farby: ink `#111214`, paper `#F6F8FC`, blue `#2447F5`, teal `#14B8A6`, cyan `#1FB8E8`, muted `#4A5468`, text `#3A3F4B`, tmavé sekcie `#0A0F1E`.
  Gradient: `--gradient` (modrá → tyrkysová). Používa sa iba v páse za hero, v záverečnom páse a v malých zvýraznených blokoch.
- Sklo (`.glass`, hlavička, menu): vždy dostatočne matné, text na skle musí mať kontrast min. 4.5:1.
  Prvok so sklom nesmie obsahovať ďalšie sklo (prehliadač ho nerozmaže) – preto má hlavička sklo v `::before`.
- Tlačidlá: zaoblené (999px), hover = prehodenie farieb pozadia a textu, šípka `›` sa posunie.
- Animácie: prehrajú sa raz – hero pri načítaní, sekcie s `data-anim` keď prídu do obrazu (`assets/js/web/anim.js` pridá `.in`).
  Nepretržite sa hýbe iba gradient v páse a kurzor `_` v logu. Všetko rešpektuje `prefers-reduced-motion`.
- 3D ilustrácie služieb sú vygenerované SVG (izometria) priamo v `index.html`; meniť ich ručne len opatrne.
- Údaje v ukážke klientskej zóny v hero sú ilustračné a musia byť tak označené.

## Zakázané (AI slop)
Fialové gradienty, gradient v texte, štítky nad nadpismi („eyebrow“), číslovanie 01/02/03, ikony v štvorčekoch, emoji,
farebné pruhy na okraji kariet, deliace čiary medzi položkami, šum/grain, prvky, ktoré sa pri scrollovaní objavujú bez dôvodu,
žiar za kurzorom, dlhé pomlčky „—“ v texte, buzzwordy (inovatívny, robustný, seamless, posunúť na vyššiu úroveň…),
vymyslené čísla a vymyslené referencie/mená. Ak chýba skutočný obsah, sekciu skry, nepíš výplň.
