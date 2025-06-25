const { chromium } = require('playwright');
const fs = require('fs');

async function scrapeVividSeats() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  
  try {
    console.log('Navigating to Vivid Seats...');
    await page.goto('https://www.vividseats.com/concerts', {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    console.log('Scraping Vivid Seats listings...');
    const data = await page.evaluate(() => {
      const events = [];
      
      // Find all listing containers
      const listings = document.querySelectorAll('[data-testid="listing-row-container"]');
      
      listings.forEach(listing => {
        try {
          // Extract title from the URL
          const url = listing.closest('a')?.href || '';
          const titleMatch = url.match(/\/([^\/]+)-tickets/);
          const title = titleMatch ? 
            decodeURIComponent(titleMatch[1].replace(/-/g, ' ')) : 
            'Unknown Event';
          
          // Extract price
          const priceElement = listing.querySelector('[data-testid="listing-price"]');
          const price = priceElement ? 
            priceElement.textContent.replace(/\$|,/g, '') : 
            '0';
          
          // Extract section and row
          const sectionElement = listing.querySelector('[data-testid="Section"]');
          const rowElement = listing.querySelector('[data-testid="row"]');
          
          // Extract ticket count
          const ticketText = listing.querySelector('[data-testid="row"]')?.nextElementSibling?.textContent || '';
          const ticketMatch = ticketText.match(/(\d+) tickets?/);
          const ticketCount = ticketMatch ? ticketMatch[1] : '1';
          
          events.push({
            title,
            price: parseFloat(price),
            url,
            section: sectionElement?.textContent || 'N/A',
            row: rowElement?.textContent.replace('Row', '').trim() || 'N/A',
            ticketCount: parseInt(ticketCount)
          });
        } catch (e) {
          console.error('Error processing listing:', e);
        }
      });
      
      return events;
    });

    console.log(`Found ${data.length} Vivid Seats listings`);
    return data;
  } catch (error) {
    console.error('Error scraping Vivid Seats:', error);
    return [];
  } finally {
    await browser.close();
  }
}

// Main function
(async () => {
  console.log('==== STARTING TICKET SCRAPER ====');
  
  try {
    const vividData = await scrapeVividSeats();
    
    const result = {
      vividSeats: vividData,
      timestamp: new Date().toISOString()
    };
    
    // Write data to file
    fs.writeFileSync('data.json', JSON.stringify(result, null, 2));
    console.log(`Scraped ${vividData.length} Vivid Seats listings`);
    
  } catch (error) {
    console.error('Fatal error:', error);
    fs.writeFileSync('data.json', JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }));
  }
  
  console.log('==== SCRAPER COMPLETED ====');
})();
