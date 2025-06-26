const { chromium } = require('playwright');
const fs = require('fs');

// Helper function to wait for network idle
async function waitForNetworkIdle(page, timeout = 30000) {
  await page.waitForLoadState('networkidle', { timeout });
}

// Vivid Seats Scraper
async function scrapeVividSeats() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  try {
    console.log('Navigating to Vivid Seats...');
    await page.goto('https://www.vividseats.com/concerts', { timeout: 60000 });
    await waitForNetworkIdle(page);

    // Scrape top event cards
    const topEvents = await page.$$eval('[data-testid^="category-top-picks-carousel-card"]', cards => 
      cards.map(card => {
        const title = card.querySelector('[data-testid="card-headliner"]')?.textContent?.trim();
        const date = card.querySelector('[data-testid="card-date-pill-0"]')?.textContent?.replace(/\s+/g, ' ')?.trim();
        const venue = card.querySelector('[data-testid="card-venue-name-0"]')?.textContent?.trim();
        const url = card.querySelector('a[href]')?.href;
        return title && url ? { title, date, venue, url } : null;
      }).filter(Boolean)
    );

    console.log(`Found ${topEvents.length} top events`);

    // Scrape listings for 3 events
    const detailedEvents = [];
    for (const event of topEvents.slice(0, 3)) {
      console.log(`Scraping listings for: ${event.title}`);
      await page.goto(event.url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="listing-row-container"]', { timeout: 10000 });
      
      const listings = await page.$$eval('[data-testid="listing-row-container"]', elements => 
        elements.map(el => {
          try {
            const section = el.querySelector('[data-testid*="Section"]')?.textContent?.trim();
            const row = el.querySelector('[data-testid="row"]')?.textContent?.replace('Row', '').trim();
            const price = el.querySelector('[data-testid="listing-price"]')?.textContent?.replace(/\$|,/g, '');
            const ticketText = el.textContent.match(/(\d+)\s+tickets?/);
            
            return {
              section: section || 'N/A',
              row: row || 'N/A',
              price: price ? Number(price) : 0,
              ticketCount: ticketText ? Number(ticketText[1]) : 1,
              feesIncluded: el.textContent.includes('Fees Incl.')
            };
          } catch (e) {
            return null;
          }
        }).filter(Boolean)
      );
      
      detailedEvents.push({
        ...event,
        listings,
        minPrice: listings.length > 0 ? Math.min(...listings.map(l => l.price)) : 0,
        maxPrice: listings.length > 0 ? Math.max(...listings.map(l => l.price)) : 0
      });
    }
    
    return detailedEvents;
  } catch (error) {
    console.error('Vivid Seats scraping failed:', error);
    return [];
  } finally {
    await browser.close();
  }
}

// StubHub Scraper
async function scrapeStubHub() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  try {
    console.log('Navigating to StubHub concerts page...');
    await page.goto('https://www.stubhub.com/concerts-tickets/category/1/', { timeout: 60000 });
    await page.waitForSelector('[data-testid="category-top-picks-carousel"]', { timeout: 15000 });
    
    // Scrape top event cards
    const topEvents = await page.$$eval('[data-testid="category-top-picks-carousel"] a[href*="/event/"]', cards => 
      cards.map(card => {
        try {
          const titleElement = card.querySelector('p:first-child');
          const dateElement = card.querySelector('p:nth-child(2)');
          const venueElement = card.querySelector('p:nth-child(3)');
          
          if (!titleElement || !dateElement) return null;
          
          return {
            title: titleElement.textContent.trim(),
            date: dateElement.textContent.trim(),
            venue: venueElement?.textContent.trim() || 'Venue not available',
            url: card.href
          };
        } catch (e) {
          return null;
        }
      }).filter(Boolean)
    );

    console.log(`Found ${topEvents.length} top events`);

    // Scrape detailed listings for each event
    const detailedEvents = [];
    for (const event of topEvents.slice(0, 3)) {
      if (!event.url) continue;
      
      console.log(`Navigating to StubHub event: ${event.title}`);
      try {
        await page.goto(event.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('[data-listing-id]', { timeout: 10000 });
        
        const eventListings = await page.$$eval('.event-listing[data-listing-id]', listings => 
          listings.map(listing => {
            try {
              const price = listing.getAttribute('data-price')?.replace('$', '') || '0';
              const sectionElement = listing.querySelector('.sc-afca01a5-23 p, .section-details');
              const rowElement = listing.querySelector('.sc-afca01a5-24 p, .row-details');
              const ticketCountElement = Array.from(listing.querySelectorAll('p'))
                .find(p => p.textContent.includes('ticket'));
              
              return {
                section: sectionElement?.textContent.trim() || 'N/A',
                row: rowElement?.textContent.trim() || 'N/A',
                price: parseFloat(price) || 0,
                ticketCount: ticketCountElement?.textContent.match(/\d+/)?.[0] || '1',
                feesIncluded: listing.textContent.includes('Fees included') || false
              };
            } catch (e) {
              return null;
            }
          }).filter(Boolean)
        );
        
        detailedEvents.push({
          ...event,
          listings: eventListings,
          minPrice: eventListings.length > 0 ? Math.min(...eventListings.map(l => l.price)) : 0,
          maxPrice: eventListings.length > 0 ? Math.max(...eventListings.map(l => l.price)) : 0
        });
      } catch (error) {
        console.error(`Failed to scrape ${event.title}:`, error);
      }
    }

    return detailedEvents;
  } catch (error) {
    console.error('Error scraping StubHub:', error);
    return [];
  } finally {
    await browser.close();
  }
}

// Arbitrage Analyzer
function findArbitrageOpportunities(vividEvents, stubHubEvents) {
  const opportunities = [];
  
  vividEvents.forEach(vividEvent => {
    if (!vividEvent.listings || vividEvent.listings.length === 0) return;
    
    const matchingStubEvent = stubHubEvents.find(e => e.title === vividEvent.title);
    const vividMinPrice = vividEvent.minPrice;
    
    if (!matchingStubEvent || !matchingStubEvent.listings || matchingStubEvent.listings.length === 0) {
      const targetPrice = vividMinPrice * 1.2; // 20% profit estimate
      opportunities.push({
        event: vividEvent.title,
        date: vividEvent.date,
        venue: vividEvent.venue,
        buyFrom: 'VividSeats',
        buyPrice: vividMinPrice,
        sellOn: 'StubHub',
        sellPrice: targetPrice.toFixed(2),
        minTicketCount: Math.min(...vividEvent.listings.map(l => l.ticketCount)),
        profitPerTicket: (targetPrice - vividMinPrice).toFixed(2),
        profitMargin: '20% (estimated)',
        lastUpdated: new Date().toISOString()
      });
      return;
    }
    
    const stubMinPrice = matchingStubEvent.minPrice;
    const potentialProfit = stubMinPrice * 0.85 - vividMinPrice;
    
    if (potentialProfit > 0) {
      opportunities.push({
        event: vividEvent.title,
        date: vividEvent.date,
        venue: vividEvent.venue,
        buyFrom: 'VividSeats',
        buyPrice: vividMinPrice,
        sellOn: 'StubHub',
        sellPrice: stubMinPrice,
        minTicketCount: Math.min(...vividEvent.listings.map(l => l.ticketCount)),
        profitPerTicket: potentialProfit.toFixed(2),
        profitMargin: ((potentialProfit / vividMinPrice) * 100).toFixed(1) + '%',
        lastUpdated: new Date().toISOString()
      });
    }
  });
  
  return opportunities;
}

// Main Function
(async () => {
  console.log('==== TICKET ARBITRAGE SCRAPER ====');
  
  try {
    const [vividData, stubHubData] = await Promise.allSettled([
      scrapeVividSeats(),
      scrapeStubHub()
    ]);
    
    const vividEvents = vividData.status === 'fulfilled' ? vividData.value : [];
    const stubEvents = stubHubData.status === 'fulfilled' ? stubHubData.value : [];
    
    const opportunities = findArbitrageOpportunities(vividEvents, stubEvents);
    
    const result = {
      scrapedAt: new Date().toISOString(),
      vividSeats: vividEvents,
      stubHub: stubEvents,
      opportunities
    };
    
    fs.writeFileSync('data.json', JSON.stringify(result, null, 2));
    console.log(`Found ${opportunities.length} arbitrage opportunities`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    fs.writeFileSync('data.json', JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }));
  }
  
  console.log('==== SCRAPER COMPLETED ====');
})();
