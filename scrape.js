const { chromium } = require('playwright');
const fs = require('fs');

// Shared browser configuration
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
];

// Launch browser with proxy support
async function launchBrowser() {
    const proxyOptions = process.env.PROXY_SERVER ? {
        server: process.env.PROXY_SERVER,
        username: process.env.PROXY_USER,
        password: process.env.PROXY_PASS
    } : undefined;

    return await chromium.launch({
        proxy: proxyOptions,
        headless: true,
        timeout: 90000
    });
}

// Vivid Seats Scraper
async function scrapeVividSeats() {
    const browser = await launchBrowser();
    const context = await browser.newContext({
        userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
        viewport: { width: 1280, height: 800 },
        javaScriptEnabled: true
    });

    try {
        console.log('[VividSeats] Navigating to concerts page...');
        const page = await context.newPage();
        await page.goto('https://www.vividseats.com/concerts', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Scrape top event cards
        const topEvents = await page.evaluate(() => {
            const events = [];
            const cards = document.querySelectorAll('[data-testid^="category-top-picks-carousel-card"]');
            
            cards.forEach(card => {
                try {
                    const title = card.querySelector('[data-testid="card-headliner"]')?.textContent?.trim();
                    const date = card.querySelector('[data-testid="card-date-pill-0"]')?.textContent?.replace(/\s+/g, ' ')?.trim();
                    const venue = card.querySelector('[data-testid="card-venue-name-0"]')?.textContent?.trim();
                    const url = card.querySelector('a[href]')?.href;
                    
                    if (title && url) {
                        events.push({ title, date, venue, url });
                    }
                } catch (e) {
                    console.warn('Error processing card:', e);
                }
            });
            
            return events;
        });

        console.log(`[VividSeats] Found ${topEvents.length} top events`);

        // Scrape listings for top 3 events in parallel
        const detailedEvents = await Promise.all(topEvents.slice(0, 3).map(async (event) => {
            const eventPage = await context.newPage();
            try {
                console.log(`[VividSeats] Scraping: ${event.title}`);
                await eventPage.goto(event.url, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 45000
                });
                
                // Wait for listings to load
                await eventPage.waitForSelector('[data-testid="listing-row-container"]', {
                    timeout: 15000,
                    state: 'attached'
                });
                
                const listings = await eventPage.evaluate(() => {
                    const results = [];
                    const elements = document.querySelectorAll('[data-testid="listing-row-container"]');
                    
                    elements.forEach(el => {
                        try {
                            const section = el.querySelector('[data-testid^="Section"]')?.textContent?.trim();
                            const row = el.querySelector('[data-testid="row"]')?.textContent?.replace('Row', '').trim();
                            const priceEl = el.querySelector('[data-testid="listing-price"]');
                            const price = priceEl?.textContent?.replace(/\$|,/g, '');
                            const ticketText = el.textContent.match(/(\d+)\s+tickets?/);
                            
                            results.push({
                                section: section || 'N/A',
                                row: row || 'N/A',
                                price: price ? Number(price) : 0,
                                ticketCount: ticketText ? Number(ticketText[1]) : 1,
                                feesIncluded: el.textContent.includes('Fees Incl.')
                            });
                        } catch (e) {
                            console.warn('Error processing listing:', e);
                        }
                    });
                    
                    return results;
                });
                
                return {
                    ...event,
                    listings,
                    minPrice: listings.length ? Math.min(...listings.map(l => l.price)) : 0,
                    maxPrice: listings.length ? Math.max(...listings.map(l => l.price)) : 0
                };
            } catch (error) {
                console.error(`[VividSeats] Failed to scrape ${event.title}:`, error);
                return {
                    ...event,
                    listings: [],
                    minPrice: 0,
                    maxPrice: 0
                };
            } finally {
                await eventPage.close();
            }
        }));
        
        return detailedEvents.filter(e => e.listings.length > 0);
    } catch (error) {
        console.error('[VividSeats] Global scraping failed:', error);
        return [];
    } finally {
        await browser.close();
    }
}

// StubHub Scraper
async function scrapeStubHub() {
    const browser = await launchBrowser();
    const context = await browser.newContext({
        userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
        viewport: { width: 1280, height: 800 },
        javaScriptEnabled: true
    });

    try {
        console.log('[StubHub] Navigating to concerts page...');
        const page = await context.newPage();
        await page.goto('https://www.stubhub.com/concerts-tickets/category/1/', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        // Scrape top event cards
        const topEvents = await page.evaluate(() => {
            const events = [];
            const cards = document.querySelectorAll('a[href*="/event/"]');
            
            cards.forEach(card => {
                try {
                    const titleElement = card.querySelector('p:first-child');
                    const dateElement = card.querySelector('p:nth-child(2)');
                    const venueElement = card.querySelector('p:nth-child(3)');
                    
                    if (!titleElement || !dateElement) return;
                    
                    events.push({
                        title: titleElement.textContent.trim(),
                        date: dateElement.textContent.trim(),
                        venue: venueElement?.textContent.trim() || 'Venue not available',
                        url: card.href
                    });
                } catch (e) {
                    console.warn('Error processing card:', e);
                }
            });
            
            return events;
        });

        console.log(`[StubHub] Found ${topEvents.length} top events`);

        // Scrape detailed listings for top 3 events in parallel
        const detailedEvents = await Promise.all(topEvents.slice(0, 3).map(async (event) => {
            const eventPage = await context.newPage();
            try {
                console.log(`[StubHub] Scraping: ${event.title}`);
                await eventPage.goto(event.url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 45000
                });
                
                // Wait for listings to load
                await eventPage.waitForSelector('.event-listing[data-listing-id]', {
                    timeout: 15000,
                    state: 'attached'
                });
                
                const listings = await eventPage.evaluate(() => {
                    const results = [];
                    const elements = document.querySelectorAll('.event-listing[data-listing-id]');
                    
                    elements.forEach(el => {
                        try {
                            const price = el.getAttribute('data-price')?.replace('$', '') || '0';
                            const sectionElement = el.querySelector('.sc-afca01a5-23 p');
                            const rowElement = el.querySelector('.sc-afca01a5-24 p');
                            const ticketCountElement = Array.from(el.querySelectorAll('p'))
                                .find(p => p.textContent.includes('ticket'));
                            
                            results.push({
                                section: sectionElement?.textContent.trim() || 'N/A',
                                row: rowElement?.textContent.trim() || 'N/A',
                                price: parseFloat(price) || 0,
                                ticketCount: ticketCountElement?.textContent.match(/\d+/)?.[0] || '1',
                                feesIncluded: el.textContent.includes('Fees included')
                            });
                        } catch (e) {
                            console.warn('Error processing listing:', e);
                        }
                    });
                    
                    return results;
                });
                
                return {
                    ...event,
                    listings,
                    minPrice: listings.length ? Math.min(...listings.map(l => l.price)) : 0,
                    maxPrice: listings.length ? Math.max(...listings.map(l => l.price)) : 0
                };
            } catch (error) {
                console.error(`[StubHub] Failed to scrape ${event.title}:`, error);
                return {
                    ...event,
                    listings: [],
                    minPrice: 0,
                    maxPrice: 0
                };
            } finally {
                await eventPage.close();
            }
        }));
        
        return detailedEvents.filter(e => e.listings.length > 0);
    } catch (error) {
        console.error('[StubHub] Global scraping failed:', error);
        return [];
    } finally {
        await browser.close();
    }
}

// Normalize event titles for matching
function normalizeTitle(title) {
    if (!title) return '';
    return title.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .replace(/\b(ft|feat|vs|and|the)\b/g, '')
        .trim();
}

// Accurate profit calculation with fees
function calculateProfit(vividPrice, stubPrice) {
    // Fee structures (adjust based on actual platform fees)
    const VIVID_FEES = 0.18; // 18% buyer fees
    const STUBHUB_FEES = 0.15; // 15% seller fees
    
    const totalBuyCost = vividPrice * (1 + VIVID_FEES);
    const netSellProceeds = stubPrice * (1 - STUBHUB_FEES);
    const profit = netSellProceeds - totalBuyCost;
    
    return {
        profit,
        margin: profit > 0 ? (profit / totalBuyCost) * 100 : 0
    };
}

// Find arbitrage opportunities
function findArbitrageOpportunities(vividEvents, stubHubEvents) {
    const opportunities = [];
    
    vividEvents.forEach(vividEvent => {
        if (!vividEvent.listings.length) return;
        
        const stubEvent = stubHubEvents.find(e => 
            normalizeTitle(e.title) === normalizeTitle(vividEvent.title)
        );
        
        if (!stubEvent || !stubEvent.listings.length) return;
        
        const profitData = calculateProfit(vividEvent.minPrice, stubEvent.minPrice);
        if (profitData.profit <= 0) return;
        
        opportunities.push({
            e: vividEvent.title,        // Event
            d: vividEvent.date,         // Date
            v: vividEvent.venue,        // Venue
            b: vividEvent.minPrice,     // Buy price
            s: stubEvent.minPrice,      // Sell price
            p: profitData.profit,       // Profit per ticket
            m: profitData.margin,       // Profit margin (%)
            t: Math.min(...vividEvent.listings.map(l => l.ticketCount)), // Min tickets
            u: new Date().toISOString() // Updated timestamp
        });
    });
    
    return opportunities;
}

// Main function
(async () => {
    console.log('===== TICKET ARBITRAGE SCRAPER STARTED =====');
    const startTime = Date.now();
    
    try {
        // Run scrapers in parallel
        const [vividData, stubHubData] = await Promise.all([
            scrapeVividSeats(),
            scrapeStubHub()
        ]);
        
        console.log(`[Results] VividSeats: ${vividData.length} events`);
        console.log(`[Results] StubHub: ${stubHubData.length} events`);
        
        // Find arbitrage opportunities
        const opportunities = findArbitrageOpportunities(vividData, stubHubData);
        console.log(`[Results] Found ${opportunities.length} arbitrage opportunities`);
        
        // Prepare compressed output
        const output = {
            t: new Date().toISOString(),  // Timestamp
            o: opportunities              // Opportunities
        };
        
        // Save to file
        fs.writeFileSync('data.json', JSON.stringify(output));
        console.log(`[Output] Data saved to data.json (${Math.round(Buffer.byteLength(JSON.stringify(output)) / 1024)} KB)`);
        
    } catch (error) {
        console.error('[Fatal] Scraper failed:', error);
        fs.writeFileSync('data.json', JSON.stringify({
            e: error.message,
            t: new Date().toISOString()
        }));
    } finally {
        console.log(`===== SCRAPER COMPLETED IN ${((Date.now() - startTime) / 1000).toFixed(1)} SECONDS =====`);
    }
})();
