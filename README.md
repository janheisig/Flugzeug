# Fensterflug

Welches Flugzeug sehe ich gerade aus dem Fenster? Die Web-App zeigt live alle Flugzeuge in der Umgebung und wählt automatisch das, das in der eingestellten Blickrichtung am höchsten über dem Horizont steht: Flugnummer, Airline, Route mit Karte, Flugzeugtyp, Kennzeichen, Höhe, Geschwindigkeit und wohin man schauen muss.

**App öffnen:** https://janheisig.github.io/Flugzeug/

## Einstellungen (Zahnrad)

- **Fensterposition:** auf der Karte antippen oder GPS übernehmen (Standard: Frankfurt-Ostend)
- **Blickrichtung und Sichtfeld:** Schieberegler oder „Mit Handy-Kompass zielen“ (Handy-Oberkante zeigt die Richtung)
- **Maximale Entfernung, Mindesthöhe über dem Horizont, Fensterhöhe über dem Boden**

Alles wird im Browser des jeweiligen Geräts gespeichert.

## Datenquellen

- Live-Positionen (ADS-B): [adsb.lol](https://adsb.lol) und [adsb.fi](https://adsb.fi), Open Data (ODbL)
- Routen, Airlines, Flugzeugdaten und Fotos: [adsbdb](https://www.adsbdb.com)
- Karte: Esri

Die Routen stammen aus einer Flugplan-Datenbank und können bei Sonder- oder Charterflügen fehlen oder falsch sein.

## Datenserver (Cloudflare Worker)

adsb.lol und adsb.fi erlauben keinen direkten Abruf aus dem Browser. `worker.js` ist ein kleiner Durchreicher, der kostenlos als Cloudflare Worker läuft:

1. dash.cloudflare.com → Workers & Pages → Create → Hello World → Name `flugzeug` → Deploy
2. Edit code → Inhalt von `worker.js` einfügen → Deploy
3. Die Worker-Adresse (`https://flugzeug.NAME.workers.dev`) in `index.html` bei `DEFAULT_RELAY` eintragen oder in der App unter ⚙ → Datenserver
