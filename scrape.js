const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Helper function to scrape a website with enhanced debugging
async function scrapeWebsite(url, selectors, siteName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const debugPrefix = `${siteName}-${timestamp}`;
  
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  try {
    // Set realistic browser characteristics
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    
    console.log(`Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 120000
    });

    // Wait for potential content containers
    const waitSelectors = [
      selectors.eventSelector,
      '.event-list', '.results-container', '.events-container'
    ].filter(s => s);
    
    await Promise.any(waitSelectors.map(selector => 
      page.waitForSelector(selector, { timeout: 15000 })
    )).catch(() => console.warn('No container elements found'));

    console.log(`Scraping ${siteName}...`);
    const data = await page.evaluate((selectors) => {
      const events = [];
      const eventElements = document.querySelectorAll(selectors.eventSelector);
      
      console.log(`Found ${eventElements.length} event containers`);
      
      eventElements.forEach(el => {
        try {
          // Get title
          let title = 'N/A';
          if (selectors.titleSelector) {
            const titleEl = el.querySelector(selectors.titleSelector);
            if (titleEl) title = titleEl.innerText.trim();
          }
          
          // Get price
          let price = '0';
          if (selectors.priceSelector) {
            const priceEl = el.querySelector(selectors.priceSelector);
            if (priceEl) {
              const priceText = priceEl.innerText.replace(/\$|,/g, '');
              price = parseFloat(priceText) || '0';
            }
          }
          
          // Get URL
          let url = window.location.href;
          if (selectors.urlSelector) {
            const urlEl = el.querySelector(selectors.urlSelector);
            if (urlEl && urlEl.href) url = urlEl.href;
          }

          events.push({ title, price, url });
        } catch (e) {
          console.error(`Error processing element: ${e.message}`);
        }
      });
      
      return events;
    }, selectors);

    console.log(`Found ${data.length} events on ${siteName}`);
    
    // Save debug files if no results
    if (data.length === 0) {
      console.warn(`No events found! Saving debug files...`);
      await saveDebugFiles(page, debugPrefix);
    }
    
    return data;
  } catch (error) {
    console.error(`Error scraping ${siteName}: ${error.message}`);
    await saveDebugFiles(page, debugPrefix);
    return [];
  } finally {
    await browser.close();
  }
}

// Save debug files (HTML and screenshot)
async function saveDebugFiles(page, prefix) {
  try {
    // Save HTML
    const html = await page.content();
    const htmlPath = `${prefix}.html`;
    fs.writeFileSync(htmlPath, html);
    console.log(`Saved HTML: ${htmlPath}`);
    
    // Save screenshot
    const screenshotPath = `${prefix}.png`;
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    console.log(`Saved screenshot: ${screenshotPath}`);
  } catch (e) {
    console.error('Failed to save debug files:', e.message);
  }
}

// Current Vivid Seats selectors
async function scrapeVividSeats() {
  return scrapeWebsite(
    'https://www.vividseats.com/concerts.html',
    {
      eventSelector: '.event-card, .EventCard, .event-listing, [data-testid="event-card"]',
      titleSelector: 'h3, .event-title, [data-testid="event-title"]',
      priceSelector: '.price, .minPrice, [data-testid="event-card-price"]',
      urlSelector: 'a'
    },
    'VividSeats'
  );
}

// Current StubHub selectors
async function scrapeStubHub() {
  return scrapeWebsite(
    'https://www.stubhub.com/concerts-tickets/category/1/',
    {
      eventSelector: '.EventItem, .event-card, [data-testid="event-item"]',
      titleSelector: 'h3, .event-title, [data-testid="event-title"]',
      priceSelector: '.price, .event-price, [data-testid="event-item-price"]',
      urlSelector: 'a'
    },
    'StubHub'
  );
}

// AI Analysis function (unchanged)
async function analyzeData(data) {
  try {
    console.log('Starting AI analysis...');
    
    // Prepare the prompt
    const prompt = `Analyze these ticket prices for arbitrage opportunities:
${JSON.stringify(data, null, 2)}

Identify events where:
1. Price difference between platforms > 20%
2. Events with "sold out" or "limited" tags
3. Calculate profit after 15% platform fees

Format output as valid JSON:
{
  "opportunities": [
    {
      "event": "Event Name",
      "buyFrom": "Platform with lower price",
      "buyPrice": 100,
      "sellTo": "Platform with higher price",
      "sellPrice": 150,
      "fees": 22.5,
      "profit": 27.5,
      "margin": 27.5
    }
  ]
}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "deepseek-ai/deepseek-coder:33b-instruct",
        messages: [{
          role: "user",
          content: prompt
        }]
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    const analysis = result.choices[0].message.content;
    
    // Extract JSON from response
    const jsonStart = analysis.indexOf('{');
    const jsonEnd = analysis.lastIndexOf('}') + 1;
    const jsonString = analysis.substring(jsonStart, jsonEnd);
    
    return JSON.parse(jsonString);
  } catch (e) {
    console.error('AI analysis failed:', e.message);
    return { opportunities: [] };
  }
}

// Main function
(async () => {
  console.log('==== STARTING TICKET SCRAPER ====');
  
  try {
    // Scrape both sites in parallel
    const [vividData, stubData] = await Promise.all([
      scrapeVividSeats(),
      scrapeStubHub()
    ]);
    
    const combined = {
      vividSeats: vividData,
      stubHub: stubData,
      timestamp: new Date().toISOString()
    };
    
    console.log(`Scraped ${vividData.length} Vivid events, ${stubData.length} StubHub events`);
    
    // Analyze data with AI
    const analysis = await analyzeData(combined);
    combined.analysis = analysis;
    console.log(`AI found ${analysis.opportunities.length} opportunities`);
    
    // Write data to file
    console.log('Writing data.json...');
    fs.writeFileSync('data.json', JSON.stringify(combined, null, 2));
    console.log('data.json created');
    
  } catch (error) {
    console.error('!!!!! FATAL ERROR !!!!!', error);
    fs.writeFileSync('data.json', JSON.stringify({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, null, 2));
  }
  
  console.log('==== SCRAPER COMPLETED ====');
})();
