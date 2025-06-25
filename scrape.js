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

    // Scrape listings for 3 events
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

// 2. StubHub Scraper (Improved)
async function scrapeStubHub() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  try {
    console.log('Navigating to StubHub concerts page...');
    await page.goto('https://www.stubhub.com/concerts-tickets/category/1/', {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // Wait for event container to load
    await page.waitForSelector('[data-testid="category-top-picks-carousel"]', { timeout: 15000 });
    
    // Scrape top event cards
    console.log('Scraping top event cards...');
    const topEvents = await page.evaluate(() => {
      const events = [];
      const carousel = document.querySelector('[data-testid="category-top-picks-carousel"]');
      if (!carousel) return events;
      
      const cards = carousel.querySelectorAll('a[href*="/event/"]');
      
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
        } catch (e) {}
      });
      
      return events;
    });

    console.log(`Found ${topEvents.length} top events`);

    // Scrape detailed listings for each event
    const detailedEvents = [];
    
    for (const event of topEvents.slice(0, 3)) {
      if (!event.url) continue;
      
      console.log(`Navigating to StubHub event: ${event.title}`);
      try {
        await page.goto(event.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('[data-listing-id]', { timeout: 10000 });
        
        const eventListings = await page.evaluate(() => {
          const listings = [];
          const listingElements = document.querySelectorAll('.event-listing[data-listing-id]');
          
          listingElements.forEach(listing => {
            try {
              const price = listing.getAttribute('data-price')?.replace('$', '') || '0';
              const sectionElement = listing.querySelector('.sc-afca01a5-23 p');
              const rowElement = listing.querySelector('.sc-afca01a5-24 p');
              const ticketCountElement = Array.from(listing.querySelectorAll('p'))
                .find(p => p.textContent.includes('ticket'));
              
              listings.push({
                section: sectionElement?.textContent.trim() || 'N/A',
                row: rowElement?.textContent.trim() || 'N/A',
                price: parseFloat(price) || 0,
                ticketCount: ticketCountElement?.textContent.match(/\d+/)?.[0] || '1',
                feesIncluded: listing.textContent.includes('Fees included') || false
              });
            } catch (e) {}
          });
          
          return listings;
        });
        
        detailedEvents.push({
          ...event,
          listings: eventListings,
          minPrice: eventListings.length > 0 ? Math.min(...eventListings.map(l => l.price)) : 0,
          maxPrice: eventListings.length > 0 ? Math.max(...eventListings.map(l => l.price)) : 0
        });
        
        console.log(`Found ${eventListings.length} listings for ${event.title}`);
      } catch (error) {
        console.error(`Failed to scrape ${event.title}:`, error);
        detailedEvents.push({
          ...event,
          listings: [],
          minPrice: 0,
          maxPrice: 0
        });
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

// 3. Arbitrage Analyzer (Fixed)
function findArbitrageOpportunities(vividEvents, stubHubEvents) {
  const opportunities = [];
  
  vividEvents.forEach(vividEvent => {
    if (!vividEvent.listings || vividEvent.listings.length === 0) return;
    
    // Find matching event on StubHub
    const matchingStubEvent = stubHubEvents.find(
      stubEvent => stubEvent.title === vividEvent.title
    );
    
    // Use fallback if no StubHub data
    if (!matchingStubEvent || !matchingStubEvent.listings || matchingStubEvent.listings.length === 0) {
      const targetPrice = vividEvent.minPrice * 1.2; // 20% profit estimate
      opportunities.push({
        event: vividEvent.title,
        date: vividEvent.date,
        venue: vividEvent.venue,
        buyFrom: 'VividSeats',
        buyPrice: vividEvent.minPrice,
        sellOn: 'StubHub',
        sellPrice: targetPrice.toFixed(2),
        minTicketCount: Math.min(...vividEvent.listings.map(l => l.ticketCount)),
        profitPerTicket: (targetPrice - vividEvent.minPrice).toFixed(2),
        profitMargin: '20% (estimated)',
        lastUpdated: new Date().toISOString()
      });
      return;
    }
    
    // Compare min prices
    const vividMinPrice = vividEvent.minPrice;
    const stubMinPrice = matchingStubEvent.minPrice;
    
    // Calculate potential profit (15% StubHub seller fee)
    const potentialProfit = stubMinPrice * 0.85 - vividMinPrice;
    const profitMargin = (potentialProfit / vividMinPrice) * 100;
    
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
        profitMargin: profitMargin.toFixed(1) + '%',
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
    // Scrape both platforms in parallel
    const [vividData, stubHubData] = await Promise.all([
      scrapeVividSeats(),
      scrapeStubHub()
    ]);
    
    // Find arbitrage opportunities
    const opportunities = findArbitrageOpportunities(vividData, stubHubData);
    
    // Prepare final dataset
    const result = {
      scrapedAt: new Date().toISOString(),
      vividSeats: vividData,
      stubHub: stubHubData,
      opportunities
    };
    
    // Save to file
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
