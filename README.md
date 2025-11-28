# Samsølinjen Fartplan Scraper

En Apify actor til at scrape færgeafgange fra Samsølinjens fartplan på https://www.samsoelinjen.dk/fartplan.

## Funktioner

- Scraper færgeafgange fra Samsølinjens fartplan
- Håndterer både API-baserede og HTML-baserede data
- Accepterer automatisk cookies
- Strukturerer data i JSON-format

## Installation

```bash
npm install
```

## Brug lokalt

```bash
npm start
```

## Input parametre

- `startUrl` (valgfri): URL til fartplan siden (standard: https://www.samsoelinjen.dk/fartplan)
- `maxDepartures` (valgfri): Maksimalt antal afgange der skal scrapes (standard: 50)

## Output

Actor'en gemmer data separeret efter retning. Hver retning får sin egen JSON-struktur:

### Afgange fra Kalundborg til Ballen:
```json
{
  "direction": "Kalundborg → Ballen",
  "route": "Kalundborg - Ballen",
  "origin": "Kalundborg",
  "destination": "Ballen",
  "url": "https://www.samsoelinjen.dk/fartplan",
  "scrapedAt": "2024-01-01T12:00:00.000Z",
  "departures": [
    {
      "departureTime": "08:00",
      "arrivalTime": "09:30",
      "route": "Kalundborg - Ballen",
      "origin": "Kalundborg",
      "destination": "Ballen",
      "index": 1
    }
  ],
  "count": 10
}
```

### Afgange fra Ballen til Kalundborg:
```json
{
  "direction": "Ballen → Kalundborg",
  "route": "Ballen - Kalundborg",
  "origin": "Ballen",
  "destination": "Kalundborg",
  "url": "https://www.samsoelinjen.dk/fartplan",
  "scrapedAt": "2024-01-01T12:00:00.000Z",
  "departures": [
    {
      "departureTime": "10:00",
      "arrivalTime": "11:30",
      "route": "Ballen - Kalundborg",
      "origin": "Ballen",
      "destination": "Kalundborg",
      "index": 1
    }
  ],
  "count": 10
}
```

Hver retning gemmes som en separat JSON-post, så du nemt kan filtrere og behandle dem hver for sig.

## Deployment til Apify

1. Opret en ny actor på https://apify.com
2. Upload alle filer
3. Kør actor'en med ønskede input parametre

## Noter

- Actor'en prøver først at hente data fra API'en, hvis den er tilgængelig
- Hvis API'en ikke er tilgængelig, faller den tilbage til HTML scraping
- Actor'en accepterer automatisk cookies for at få adgang til siden

