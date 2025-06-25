const { chromium } = require('playwright');
const fs = require('fs');

// 1. Vivid Seats Scraper
async function scrapeVividSeats() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  try {
    console.log('Navigating to Vivid Seats...');
    await page.goto('https://www.vividseats.com/concerts', {
      waitUntil: 'networkidle',
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
        } catch (e) {}
      });
      
      return events;
    });

    console.log(`Found ${topEvents.length} top events`);

    // Scrape listings for 3 events (to stay within free limits)
    const detailedEvents = [];
    for (const event of topEvents.slice(0, 3)) {
      console.log(`Scraping listings for: ${event.title}`);
      await page.goto(event.url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      
      const listings = await page.evaluate(() => {
        const results = [];
        const elements = document.querySelectorAll('[data-testid="listing-row-container"]');
        
        elements.forEach(el => {
          try {
            const section = el.querySelector('[data-testid^="Section"]')?.textContent?.trim();
            const row = el.querySelector('[data-testid="row"]')?.textContent?.replace('Row', '').trim();
            const price = el.querySelector('[data-testid="listing-price"]')?.textContent?.replace(/\$|,/g, '');
            const ticketText = el.textContent.match(/(\d+)\s+tickets?/);
            
            results.push({
              section: section || 'N/A',
              row: row || 'N/A',
              price: price ? Number(price) : 0,
              ticketCount: ticketText ? Number(ticketText[1]) : 1,
              feesIncluded: el.textContent.includes('Fees Incl.')
            });
          } catch (e) {}
        });
        
        return results;
      });
      
      detailedEvents.push({
        ...event,
        listings,
        minPrice: Math.min(...listings.map(l => l.price)),
        maxPrice: Math.max(...listings.map(l => l.price))
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

// 2. StubHub Scraper (Template - Needs Your HTML Sample)
async function scrapeStubHub() {
  // Implementation pending StubHub HTML sample
  return [];
}

// 3. Arbitrage Analyzer
function findArbitrageOpportunities(vividEvents, stubHubEvents) {
  const opportunities = [];
  
  // Simple price comparison (replace with actual StubHub data later)
  vividEvents.forEach(event => {
    if (event.listings.length === 0) return;
    
    // Assuming potential 20% profit margin
    const targetPrice = event.minPrice * 1.2;
    
    opportunities.push({
      event: event.title,
      date: event.date,
      venue: event.venue,
      buyFrom: 'VividSeats',
      buyPrice: event.minPrice,
      sellTarget: targetPrice.toFixed(2),
      minTicketCount: Math.min(...event.listings.map(l => l.ticketCount)),
      profitPerTicket: (targetPrice - event.minPrice).toFixed(2),
      profitMargin: '20% (estimated)',
      lastUpdated: new Date().toISOString()
    });
  });
  
  return opportunities;
}

// Main Function
(async () => {
  console.log('==== TICKET ARBITRAGE SCRAPER ====');
  console.log('Starting at:', new Date().toISOString());
  
  try {
    // Step 1: Scrape both platforms
    const vividData = await scrapeVividSeats();
    const stubData = await scrapeStubHub(); // Currently empty
    
    // Step 2: Find arbitrage opportunities
    const opportunities = findArbitrageOpportunities(vividData, stubData);
    
    // Step 3: Prepare final dataset
    const result = {
      scrapedAt: new Date().toISOString(),
      vividSeats: vividData,
      stubHub: stubData,
      opportunities
    };
    
    // Step 4: Save to file
    fs.writeFileSync('data.json', JSON.stringify(result, null, 2));
    console.log(`Found ${opportunities.length} arbitrage opportunities`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    fs.writeFileSync('data.json', JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }));
  }
  
  console.log('==== SCRAPING COMPLETED ====');
})();
