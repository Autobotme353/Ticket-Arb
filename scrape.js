const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeVividSeats() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  
  try {
    console.log('Navigating to Vivid Seats concerts page...');
    await page.goto('https://www.vividseats.com/concerts', {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // Scrape top event cards
    console.log('Scraping top event cards...');
    const topEvents = await page.evaluate(() => {
      const events = [];
      const cards = document.querySelectorAll('[data-testid^="category-top-picks-carousel-card"]');
      
      cards.forEach(card => {
        try {
          const titleElement = card.querySelector('[data-testid="card-headliner"]');
          const dateElement = card.querySelector('[data-testid="card-date-pill-0"]');
          const venueElement = card.querySelector('[data-testid="card-venue-name-0"]');
          const imageElement = card.querySelector('img');
          const linkElement = card.querySelector('a[href]');
          
          events.push({
            title: titleElement?.textContent?.trim() || 'Unknown Event',
            date: dateElement?.textContent?.replace(/\s+/g, ' ')?.trim() || 'Date not available',
            venue: venueElement?.textContent?.trim() || 'Venue not available',
            image: imageElement?.src || '',
            url: linkElement?.href || ''
          });
        } catch (e) {
          console.error('Error processing event card:', e);
        }
      });
      
      return events;
    });

    console.log(`Found ${topEvents.length} top events`);

    // Scrape detailed listings for each event
    const detailedListings = [];
    
    for (const event of topEvents.slice(0, 3)) { // Limit to 3 events for demo
      if (!event.url) continue;
      
      console.log(`Navigating to event: ${event.title}`);
      await page.goto(event.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2000); // Add delay to avoid detection
      
      const eventListings = await page.evaluate(() => {
        const listings = [];
        const listingElements = document.querySelectorAll('[data-testid="listing-row-container"]');
        
        listingElements.forEach(listing => {
          try {
            const sectionElement = listing.querySelector('[data-testid^="Section"]');
            const rowElement = listing.querySelector('[data-testid="row"]');
            const priceElement = listing.querySelector('[data-testid="listing-price"]');
            const ticketCountElement = listing.querySelector('.styles_divider__iimSg')?.nextSibling;
            const previewImage = listing.querySelector('img[alt="Section Preview"]');
            
            listings.push({
              section: sectionElement?.textContent?.trim() || 'N/A',
              row: rowElement?.textContent?.replace('Row', '').trim() || 'N/A',
              price: priceElement?.textContent?.replace(/\$|,/g, '') || '0',
              ticketCount: ticketCountElement?.textContent?.match(/\d+/)?.[0] || '1',
              previewImage: previewImage?.src || '',
              feesIncluded: listing.querySelector('[data-testid="fees-included-text"]')?.textContent?.includes('Incl') || false
            });
          } catch (e) {
            console.error('Error processing listing:', e);
          }
        });
        
        return listings;
      });
      
      detailedListings.push({
        ...event,
        listings: eventListings
      });
      
      console.log(`Found ${eventListings.length} listings for ${event.title}`);
    }

    return detailedListings;
  } catch (error) {
    console.error('Error scraping Vivid Seats:', error);
    return [];
  } finally {
    await browser.close();
  }
}

// Main function
(async () => {
  console.log('==== STARTING VIVID SEATS SCRAPER ====');
  
  try {
    const vividData = await scrapeVividSeats();
    
    const result = {
      scrapedAt: new Date().toISOString(),
      events: vividData
    };
    
    // Write data to file
    fs.writeFileSync('data.json', JSON.stringify(result, null, 2));
    console.log(`Scraped ${vividData.length} events with ${vividData.reduce((acc, curr) => acc + curr.listings.length, 0)} total listings`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    fs.writeFileSync('data.json', JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }));
  }
  
  console.log('==== SCRAPER COMPLETED ====');
})();
