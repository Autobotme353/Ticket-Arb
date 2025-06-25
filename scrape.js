const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const fs = require('fs');
const path = require('path');

// Add stealth and adblocker plugins
puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

// Helper function to scrape a website with enhanced stealth
async function scrapeWebsite(url, selectors, siteName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const debugPrefix = `${siteName}-${timestamp}`;
  
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    ],
    ignoreHTTPSErrors: true
  });
  
  const page = await browser.newPage();
  
  // Set extra stealth parameters
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9'
  });
  
  await page.setViewport({
    width: 1280 + Math.floor(Math.random() * 100),
    height: 800 + Math.floor(Math.random() * 100),
    deviceScaleFactor: 1,
    hasTouch: false,
    isLandscape: false,
    isMobile: false,
  });

  try {
    console.log(`Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 120000,
      referer: 'https://www.google.com/'
    });

    // Wait randomly to simulate human behavior
    await page.waitForTimeout(2000 + Math.random() * 3000);
    
    console.log(`Scraping ${siteName}...`);
    const data = await page.evaluate((selectors) => {
      // Try multiple selector strategies
      const selectorsList = selectors.split(',');
      let eventElements = [];
      
      for (const selector of selectorsList) {
        const elements = document.querySelectorAll(selector.trim());
        if (elements.length > 0) {
          eventElements = Array.from(elements);
          break;
        }
      }
      
      console.log(`Found ${eventElements.length} event containers`);
      
      const events = [];
      eventElements.forEach(el => {
        try {
          // Extract title - prioritize h tags
          let title = 'N/A';
          const titleCandidates = el.querySelectorAll('h1, h2, h3, h4, h5, h6');
          if (titleCandidates.length > 0) {
            title = titleCandidates[0].innerText.trim();
          }
          
          // Extract price - look for dollar amounts
          let price = '0';
          const textContent = el.innerText || '';
          const priceMatch = textContent.match(/\$\d{1,4}(,\d{3})*(\.\d{2})?/);
          if (priceMatch) {
            price = priceMatch[0].replace(/\$|,/g, '');
          }
          
          // Extract URL - find first link
          let url = window.location.href;
          const link = el.querySelector('a');
          if (link && link.href) {
            url = link.href;
          }

          events.push({ title, price, url });
        } catch (e) {
          console.error(`Error processing element: ${e.message}`);
        }
      });
      
      return events;
    }, selectors.eventSelector);

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

// Save debug files
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

// Updated selector strategies
async function scrapeVividSeats() {
  return scrapeWebsite(
    'https://www.vividseats.com/concerts',
    {
      eventSelector: `
        .event-card, 
        .EventCard, 
        .event-listing, 
        [data-testid="event-card"],
        .ticket-hub-event-card,
        .event-item
      `
    },
    'VividSeats'
  );
}

async function scrapeStubHub() {
  return scrapeWebsite(
    'https://www.stubhub.com/concerts-tickets/category/1/',
    {
      eventSelector: `
        .EventItem, 
        .event-card, 
        [data-testid="event-item"],
        .event-listing,
        .event-tile,
        .ticket-card
      `
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
    // Scrape both sites in sequence to avoid detection
    console.log('Scraping VividSeats...');
    const vividData = await scrapeVividSeats();
    
    // Add random delay between sites
    await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 10000));
    
    console.log('Scraping StubHub...');
    const stubData = await scrapeStubHub();
    
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
