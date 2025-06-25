const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeWebsite(url, siteName) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  
  try {
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Generic scraping - will need customization
    const data = await page.evaluate(() => {
      const events = [];
      
      // Try to find any event-like elements
      const candidates = document.querySelectorAll('.event-card, .EventItem, .listing, .ticket-card');
      
      candidates.forEach(el => {
        try {
          // Get title from first heading element
          const titleEl = el.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"]');
          const title = titleEl ? titleEl.textContent.trim() : 'Unknown Event';
          
          // Find price-like text
          const priceMatch = el.textContent.match(/\$\d{1,4}(,\d{3})*(\.\d{2})?/);
          const price = priceMatch ? priceMatch[0].replace(/\$|,/g, '') : '0';
          
          // Find first link
          const link = el.querySelector('a');
          const url = link ? link.href : window.location.href;
          
          events.push({ title, price, url });
        } catch (e) {
          console.error('Error processing element:', e);
        }
      });
      
      return events;
    });
    
    console.log(`Found ${data.length} events on ${siteName}`);
    return data;
  } catch (error) {
    console.error(`Error scraping ${siteName}: ${error.message}`);
    return [];
  } finally {
    await browser.close();
  }
}

async function scrapeVividSeats() {
  return scrapeWebsite('https://www.vividseats.com/concerts', 'VividSeats');
}

async function scrapeStubHub() {
  return scrapeWebsite('https://www.stubhub.com/concerts-tickets/category/1/', 'StubHub');
}

// Main function
(async () => {
  console.log('==== STARTING TICKET SCRAPER ====');
  
  try {
    const vividData = await scrapeVividSeats();
    const stubData = await scrapeStubHub();
    
    const combined = {
      vividSeats: vividData,
      stubHub: stubData,
      timestamp: new Date().toISOString(),
      analysis: { opportunities: [] }
    };
    
    // Write data to file
    fs.writeFileSync('data.json', JSON.stringify(combined, null, 2));
    console.log(`Scraped ${vividData.length} Vivid events, ${stubData.length} StubHub events`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    fs.writeFileSync('data.json', JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }));
  }
  
  console.log('==== SCRAPER COMPLETED ====');
})();
