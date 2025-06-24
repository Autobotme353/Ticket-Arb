const puppeteer = require('puppeteer');
const fs = require('fs');

// Helper function to scrape a website with enhanced debugging
async function scrapeWebsite(url, selectors, siteName) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  try {
    // Set realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    console.log(`Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 120000  // Increased timeout
    });

    // Wait for content to load
    await page.waitForSelector(selectors.eventSelector, {timeout: 15000})
      .catch(() => console.warn(`${siteName} event container not found`));

    console.log(`Scraping ${siteName}...`);
    const data = await page.evaluate((selectors) => {
      const events = [];
      const eventElements = document.querySelectorAll(selectors.eventSelector);
      
      console.log(`Found ${eventElements.length} event containers`);
      
      eventElements.forEach(el => {
        try {
          // Get title - try multiple selectors
          let title = 'N/A';
          if (selectors.titleSelector) {
            const titleEl = el.querySelector(selectors.titleSelector);
            if (titleEl) title = titleEl.innerText.trim();
          }
          
          // Get price - try multiple methods
          let price = '0';
          if (selectors.priceSelector) {
            const priceEl = el.querySelector(selectors.priceSelector);
            if (priceEl) price = priceEl.innerText.replace(/\$|,/g, '');
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
    
    // Take screenshot if no results
    if (data.length === 0) {
      console.warn(`No events found! Taking screenshot...`);
      await page.screenshot({ path: `${siteName}-screenshot.png` });
      fs.writeFileSync(`${siteName}-debug.html`, await page.content());
    }
    
    return data;
  } catch (error) {
    console.error(`Error scraping ${siteName}: ${error.message}`);
    return [];
  } finally {
    await browser.close();
  }
}

// Updated Vivid Seats selectors
async function scrapeVividSeats() {
  return scrapeWebsite(
    'https://www.vividseats.com/concerts.html',
    {
      eventSelector: '.event-card, .EventCard, .event-listing',
      titleSelector: '.event-title, .event-name, h3',
      priceSelector: '.price, .event-price, .minPrice',
      urlSelector: 'a'
    },
    'Vivid Seats'
  );
}

// Updated StubHub selectors
async function scrapeStubHub() {
  return scrapeWebsite(
    'https://www.stubhub.com/concerts-tickets/category/1/',
    {
      eventSelector: '.EventItem, .event-card, .event-listing',
      titleSelector: 'h3, .event-title, .event-name',
      priceSelector: '.price, .event-price, .minPrice',
      urlSelector: 'a'
    },
    'StubHub'
  );
}

// AI Analysis with OpenRouter
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

// Main function with comprehensive error handling
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
    
    // Verify file creation
    if (fs.existsSync('data.json')) {
      const stats = fs.statSync('data.json');
      console.log(`data.json created successfully! Size: ${stats.size} bytes`);
    } else {
      console.error('Error: data.json not created!');
    }
    
  } catch (error) {
    console.error('!!!!! FATAL ERROR !!!!!', error);
    
    // Save error information
    const errorData = {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('data.json', JSON.stringify(errorData, null, 2));
    console.error('Saved error information to data.json');
  }
  
  console.log('==== SCRAPER COMPLETED ====');
  
  // Debug: List all files in directory
  try {
    const files = fs.readdirSync('.');
    console.log('Directory contents:', files);
  } catch (e) {
    console.error('Could not list directory:', e.message);
  }
  console.log("Puppeteer version:", require('puppeteer/package.json').version);
})();
