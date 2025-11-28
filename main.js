import { Actor } from 'apify';
import { PuppeteerCrawler, RequestList } from 'crawlee';

await Actor.init();

const {
    startUrl = 'https://www.samsoelinjen.dk/fartplan',
    maxDepartures = 50,
} = await Actor.getInput() ?? {};

// Opret request list
const requestList = await RequestList.open('fartplan-urls', [{ url: startUrl }]);

const crawler = new PuppeteerCrawler({
    requestList,
    async handlePageFunction({ page, request }) {
        Actor.log.info(`Scraper fartplan fra: ${request.url}`);

        // Vent på at siden er fuldt indlæst
        await page.waitForSelector('body', { timeout: 30000 });

        // Accepter cookies hvis der er en cookie-banner
        try {
            const cookieButton = await page.$('button:has-text("Acceptér"), button:has-text("Accepter"), [id*="accept"], [class*="accept"]');
            if (cookieButton) {
                await cookieButton.click();
                await page.waitForTimeout(1000);
            }
        } catch (e) {
            Actor.log.debug('Ingen cookie-banner fundet eller allerede accepteret');
        }

        // Vent på at fartplanen er indlæst
        await page.waitForTimeout(3000);

        // Prøv at hente data fra API først
        let departuresFromKalundborg = [];
        let departuresFromBallen = [];
        let apiDataCaptured = false;
        
        try {
            // Lyt til API-anmodninger
            page.on('response', async (response) => {
                const url = response.url();
                if (url.includes('api.molslinjen.dk') && (url.includes('departure') || url.includes('timetable'))) {
                    try {
                        const data = await response.json();
                        Actor.log.info('Fandt API data:', JSON.stringify(data).substring(0, 300));
                        
                        // Behandl API data hvis det er relevant
                        let apiDepartures = [];
                        if (data && Array.isArray(data)) {
                            apiDepartures = data;
                        } else if (data && data.departures) {
                            apiDepartures = data.departures;
                        } else if (data && data.data) {
                            apiDepartures = data.data;
                        } else if (data && data.routes) {
                            apiDepartures = data.routes;
                        }
                        
                        // Separer efter retning
                        if (apiDepartures.length > 0) {
                            apiDataCaptured = true;
                            apiDepartures.forEach(dep => {
                                const origin = dep.origin || dep.from || dep.departurePort || '';
                                const destination = dep.destination || dep.to || dep.arrivalPort || '';
                                const route = dep.route || `${origin} - ${destination}`;
                                
                                if (origin.toLowerCase().includes('kalundborg') || route.toLowerCase().includes('kalundborg')) {
                                    departuresFromKalundborg.push({
                                        departureTime: dep.departureTime || dep.time || dep.departure || '',
                                        arrivalTime: dep.arrivalTime || dep.arrival || '',
                                        route: route || 'Kalundborg - Ballen',
                                        origin: origin || 'Kalundborg',
                                        destination: destination || 'Ballen',
                                        ...dep
                                    });
                                } else if (origin.toLowerCase().includes('ballen') || route.toLowerCase().includes('ballen')) {
                                    departuresFromBallen.push({
                                        departureTime: dep.departureTime || dep.time || dep.departure || '',
                                        arrivalTime: dep.arrivalTime || dep.arrival || '',
                                        route: route || 'Ballen - Kalundborg',
                                        origin: origin || 'Ballen',
                                        destination: destination || 'Kalundborg',
                                        ...dep
                                    });
                                }
                            });
                        }
                    } catch (e) {
                        Actor.log.debug('Kunne ikke parse API response som JSON:', e.message);
                    }
                }
            });

            // Vent lidt for at fange API-anmodninger
            await page.waitForTimeout(5000);
        } catch (e) {
            Actor.log.warning('Kunne ikke hente data fra API, prøver HTML scraping');
        }

        // Hvis vi ikke fik data fra API, scrape fra HTML
        if (!apiDataCaptured) {
            Actor.log.info('Scraper fra HTML...');
            
            // Find alle afgangselementer og strukturer dem efter retning
            const timetableData = await page.evaluate(() => {
                const results = {
                    kalundborgToBallen: [],
                    ballenToKalundborg: []
                };
                
                // Find alle elementer der kan indeholde fartplan data
                const allElements = Array.from(document.querySelectorAll('*'));
                const timePattern = /\d{1,2}:\d{2}/g;
                
                // Find sektioner med retninger
                allElements.forEach(el => {
                    const text = el.textContent?.trim() || '';
                    const className = el.className || '';
                    const id = el.id || '';
                    
                    // Tjek om elementet indeholder retningsinformation
                    const hasKalundborg = text.toLowerCase().includes('kalundborg');
                    const hasBallen = text.toLowerCase().includes('ballen');
                    const hasTimes = text.match(timePattern);
                    
                    if (hasTimes && hasTimes.length > 0) {
                        const times = text.match(timePattern);
                        const parentText = el.parentElement?.textContent?.toLowerCase() || '';
                        
                        // Bestem retning baseret på kontekst
                        if ((hasKalundborg && parentText.includes('kalundborg')) || 
                            (className.toLowerCase().includes('kalundborg') || id.toLowerCase().includes('kalundborg'))) {
                            times.forEach(time => {
                                results.kalundborgToBallen.push({
                                    departureTime: time,
                                    route: 'Kalundborg - Ballen',
                                    origin: 'Kalundborg',
                                    destination: 'Ballen',
                                    context: text.substring(0, 100)
                                });
                            });
                        } else if ((hasBallen && parentText.includes('ballen')) || 
                                   (className.toLowerCase().includes('ballen') || id.toLowerCase().includes('ballen'))) {
                            times.forEach(time => {
                                results.ballenToKalundborg.push({
                                    departureTime: time,
                                    route: 'Ballen - Kalundborg',
                                    origin: 'Ballen',
                                    destination: 'Kalundborg',
                                    context: text.substring(0, 100)
                                });
                            });
                        }
                    }
                });
                
                return results;
            });

            // Find også tabeller med fartplan
            const tableData = await page.evaluate(() => {
                const results = {
                    kalundborgToBallen: [],
                    ballenToKalundborg: []
                };
                
                const tables = Array.from(document.querySelectorAll('table'));
                const timePattern = /\d{1,2}:\d{2}/g;
                
                tables.forEach((table, tableIndex) => {
                    const tableText = table.textContent?.toLowerCase() || '';
                    const hasKalundborg = tableText.includes('kalundborg');
                    const hasBallen = tableText.includes('ballen');
                    
                    const rows = Array.from(table.querySelectorAll('tr'));
                    rows.forEach((row, rowIndex) => {
                        const cells = Array.from(row.querySelectorAll('td, th'));
                        const rowData = cells.map(cell => cell.textContent?.trim() || '');
                        const rowText = rowData.join(' ').toLowerCase();
                        const times = rowData.join(' ').match(timePattern);
                        
                        if (times && times.length > 0) {
                            const departure = {
                                departureTime: times[0],
                                rowData: rowData,
                                tableIndex,
                                rowIndex
                            };
                            
                            if (hasKalundborg && (rowText.includes('kalundborg') || tableIndex === 0)) {
                                results.kalundborgToBallen.push({
                                    ...departure,
                                    route: 'Kalundborg - Ballen',
                                    origin: 'Kalundborg',
                                    destination: 'Ballen'
                                });
                            } else if (hasBallen && (rowText.includes('ballen') || tableIndex === 1)) {
                                results.ballenToKalundborg.push({
                                    ...departure,
                                    route: 'Ballen - Kalundborg',
                                    origin: 'Ballen',
                                    destination: 'Kalundborg'
                                });
                            }
                        }
                    });
                });
                
                return results;
            });

            // Kombiner resultater
            departuresFromKalundborg = [...departuresFromKalundborg, ...timetableData.kalundborgToBallen, ...tableData.kalundborgToBallen];
            departuresFromBallen = [...departuresFromBallen, ...timetableData.ballenToKalundborg, ...tableData.ballenToKalundborg];
            
            // Fjern duplikater baseret på tidspunkt
            const uniqueKalundborg = [];
            const seenKalundborg = new Set();
            departuresFromKalundborg.forEach(dep => {
                if (!seenKalundborg.has(dep.departureTime)) {
                    seenKalundborg.add(dep.departureTime);
                    uniqueKalundborg.push(dep);
                }
            });
            
            const uniqueBallen = [];
            const seenBallen = new Set();
            departuresFromBallen.forEach(dep => {
                if (!seenBallen.has(dep.departureTime)) {
                    seenBallen.add(dep.departureTime);
                    uniqueBallen.push(dep);
                }
            });
            
            departuresFromKalundborg = uniqueKalundborg.slice(0, maxDepartures);
            departuresFromBallen = uniqueBallen.slice(0, maxDepartures);
            
            Actor.log.info(`Fundet ${departuresFromKalundborg.length} afgange fra Kalundborg og ${departuresFromBallen.length} afgange fra Ballen`);
        }

        // Gem resultater - separeret efter retning
        const totalDepartures = departuresFromKalundborg.length + departuresFromBallen.length;
        
        if (totalDepartures > 0) {
            // Gem afgange fra Kalundborg til Ballen
            if (departuresFromKalundborg.length > 0) {
                await Actor.pushData({
                    direction: 'Kalundborg → Ballen',
                    route: 'Kalundborg - Ballen',
                    origin: 'Kalundborg',
                    destination: 'Ballen',
                    url: request.url,
                    scrapedAt: new Date().toISOString(),
                    departures: departuresFromKalundborg.map((dep, index) => ({
                        ...dep,
                        index: index + 1
                    })),
                    count: departuresFromKalundborg.length
                });
                Actor.log.info(`Gemte ${departuresFromKalundborg.length} afgange fra Kalundborg til Ballen`);
            }
            
            // Gem afgange fra Ballen til Kalundborg
            if (departuresFromBallen.length > 0) {
                await Actor.pushData({
                    direction: 'Ballen → Kalundborg',
                    route: 'Ballen - Kalundborg',
                    origin: 'Ballen',
                    destination: 'Kalundborg',
                    url: request.url,
                    scrapedAt: new Date().toISOString(),
                    departures: departuresFromBallen.map((dep, index) => ({
                        ...dep,
                        index: index + 1
                    })),
                    count: departuresFromBallen.length
                });
                Actor.log.info(`Gemte ${departuresFromBallen.length} afgange fra Ballen til Kalundborg`);
            }
            
            Actor.log.info(`I alt gemt ${totalDepartures} afgange i ${(departuresFromKalundborg.length > 0 ? 1 : 0) + (departuresFromBallen.length > 0 ? 1 : 0)} retninger`);
        } else {
            Actor.log.warning('Ingen afgange fundet. Gemmer hele HTML for debugging.');
            const html = await page.content();
            await Actor.pushData({
                url: request.url,
                scrapedAt: new Date().toISOString(),
                html: html.substring(0, 10000), // Første 10KB
                note: 'Ingen afgange fundet - se HTML for debugging'
            });
        }
    },
    maxRequestRetries: 2,
    handlePageTimeoutSecs: 60,
});

await crawler.run();

await Actor.exit();

