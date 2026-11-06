# Prompty pre Claude Code – nový web

Spúšťaj ich **po jednom**, v tomto poradí. Po každom si výsledok pozri v prehliadači a až potom choď ďalej.
Lokálny náhľad: v priečinku repozitára `python -m http.server 8000` → http://localhost:8000

---

## Krok 0 – podklady
```
Commitni nové súbory CLAUDE.md, docs/novy-web/ a assets/fonts/ so správou "novy-web: zadanie, referencia, fonty". Nepushuj.
```

## Krok 1 – základ CSS
```
Prečítaj CLAUDE.md a docs/novy-web/ZADANIE.md. Vytvor assets/css/web.css:
- @font-face pre Archivo (variabilná, wght 100–900, wdth 62–125 %, súbory archivo-latin.woff2 a archivo-latin-ext.woff2
  s unicode-range pre latin a latin-ext) a JetBrains Mono 800 (jetbrains-mono-800.woff2, jetbrains-mono-800-ext.woff2), font-display: swap.
- CSS premenné pre všetky farby, veľkosti a medzery z CLAUDE.md.
- Základ: reset, body, odkazy, ::selection, :focus-visible, text-wrap: balance pre nadpisy a pretty pre odseky.
- Komponenty: .container, .section (+ varianty --paper, --white, --ink, --blue), .section-head, .h1, .h2, .lead,
  .btn + .btn--blue / .btn--white / .btn--dark (hover = prehodenie farieb), .logo, .block--blue, .grid-bg (dark / light / blue mriežka s maskou),
  .field (polia formulára).
Zatiaľ žiadna HTML stránka. Ukáž mi zoznam tried, ktoré si vytvoril.
```

## Krok 2 – homepage
```
Vytvor nový index.html podľa docs/novy-web/ZADANIE.md (sekcie 1–10) a vizuálu v docs/novy-web/dizajn-referencia.html.
Použi iba triedy z assets/css/web.css (ak nejaká chýba, doplň ju tam, nie inline). Starý index.html celý nahraď.
Kartu termínov v hero zatiaľ vytvor len ako HTML so statickým textom "Načítavam termíny…" – JS príde v ďalšom kroku.
Sekciu Tím vynechaj, v Medi Ready vynechaj obrázok aj citát. Texty prevezmi z referencie doslova.
Nakoniec skontroluj šírku 375 px a 1440 px a vypíš, čo si overil.
```

## Krok 3 – karta voľných termínov
```
Vytvor assets/js/web/sloty.js a pripoj ho do index.html spolu so Supabase CDN (pinni verziu @supabase/supabase-js@2.45.4)
a existujúcim assets/js/supabase-client.js. Skript načíta 3 najbližšie voľné termíny z call_slots
(rovnaký dotaz ako fetchSlots v assets/js/rezervacia.js, len limit 3) a zobrazí ich v hero karte vo formáte
"Pondelok 10. novembra, 10:00". Každý termín je odkaz na rezervacia.html. Pri chybe alebo prázdnom výsledku zobraz
"Napíšte nám na contact@techscope.sk" s mailto odkazom. Bez innerHTML s dátami z databázy – vytváraj elementy cez DOM.
```

## Krok 4 – rezervácia
```
Prerob rezervacia.html do nového dizajnu (hlavička a pätička rovnaké ako index.html, iba web.css, nie style.css).
Vytvor assets/js/web/rezervacia.js skopírovaním assets/js/rezervacia.js a uprav LEN:
- triedy a markup na nový dizajn (štýly kalendára, časov, formulára a potvrdenia doplň do web.css),
- PRODUKTY a možnosti rozpočtu podľa docs/novy-web/ZADANIE.md.
Volania rpc('vytvorit_rezervaciu', …) a functions.invoke('create-meet-event', …) nechaj znak po znaku rovnaké.
Starý assets/js/rezervacia.js nemaž. Na konci mi napíš diff volaní Supabase oproti originálu (musí byť prázdny).
```

## Krok 5 – právne stránky, 404, SEO
```
1) obchodne-podmienky.html a ochrana-udajov.html prepoj na web.css a novú hlavičku/pätičku. Text obsahu nemeň ani o slovo.
2) Vytvor 404.html v rovnakom dizajne s tlačidlom späť na úvod.
3) Doplň do index.html a rezervacia.html meta description, Open Graph, canonical, favicony a JSON-LD Organization.
4) Aktualizuj sitemap.xml (index, rezervacia, obchodne-podmienky, ochrana-udajov) a skontroluj robots.txt.
```

## Krok 6 – upratanie starého webu (až po mojom súhlase)
```
Zmaž staré stránky: data-compass.html, ai-riesenia.html, softver-na-mieru.html, web-mobile.html,
leadengine-demo.html, medi-ready-demo.html, mybookmoves-demo.html. Zmaž JS súbory, ktoré už nepoužíva
žiadna zostávajúca stránka (skontroluj grep-om, klient.html a admin.html musia fungovať ďalej).
Over, že na webe nie je žiadny odkaz na zmazaný súbor.
```

## Krok 7 – kontrola pred pushom
```
Skontroluj celý web: všetky odkazy, konzolu prehliadača bez chýb, šírky 375 / 768 / 1440 px, kontrast textu (min. 4.5:1),
ovládanie klávesnicou, že index.html neobsahuje žiadne "[" placeholdery a žiadne znaky "—".
Prejdi zoznam "Zakázané" v CLAUDE.md a potvrď, že nič z neho na webe nie je.
Potom commitni. Push urobím ja, keď web skontrolujem.
```
