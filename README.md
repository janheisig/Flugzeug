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

## Datenserver

adsb.lol und adsb.fi erlauben keinen direkten Abruf aus dem Browser. Ein kleiner Durchreicher holt die Daten und gibt sie mit CORS-Freigabe weiter:

- **`relay-deno.js`** läuft auf Deno Deploy (aktiv: `https://noble-caribou-6011.janheisig.deno.net`). Einrichtung: dash.deno.com → mit GitHub anmelden → New Playground → Code einfügen → Save & Deploy.
- **`worker.js`** ist dieselbe Logik für Cloudflare Workers. Dort werden die Quellen derzeit blockiert (Rate-Limit bzw. Sperre der Cloudflare-Adressen), er bleibt als Reserve eingetragen.

Die App probiert die Server in `DEFAULT_RELAYS` (in `index.html`) der Reihe nach; unter ⚙ lässt sich ein eigener eintragen. Diagnose: `<server>/?lat=50.11&lon=8.70&debug=1`.
