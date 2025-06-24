const puppeteer = require('puppeteer');
const fs = require('fs');

// Helper function to scrape a website
async function scrapeWebsite(url, selectors, siteName) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  try {
    console.log(`Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log(`Scraping ${siteName}...`);
    const data = await page.evaluate((selectors) => {
      const events = [];
      const eventElements = document.querySelectorAll(selectors.eventSelector);
      
      eventElements.forEach(el => {
        try {
          const titleElement = el.querySelector(selectors.titleSelector);
          const priceElement = el.querySelector(selectors.priceSelector);
          
          events.push({
            title: titleElement ? titleElement.innerText.trim() : 'N/A',
            price: priceElement ? priceElement.innerText.replace(/\$|,/g, '') : '0',
            url: window.location.href
          });
        } catch (e) {
          console.error(`Error processing element: ${e.message}`);
        }
      });
      
      return events;
    }, selectors);

    console.log(`Found ${data.length} events on ${siteName}`);
    return data;
  } catch (error) {
    console.error(`Error scraping ${siteName}: ${error.message}`);
    return [];
  } finally {
    await browser.close();
  }
}

// Scrape Vivid Seats
async function scrapeVividSeats() {
  return scrapeWebsite(
    'https://www.vividseats.com/concert-tickets',
    {
      eventSelector: '.EventCard',
      titleSelector: 'h3',
      priceSelector: '[data-testid="event-card-price"]'
    },
    'Vivid Seats'
  );
}

// Scrape StubHub
async function scrapeStubHub() {
  return scrapeWebsite(
    'https://www.stubhub.com/find/s/?q=concerts',
    {
      eventSelector: '.EventItem',
      titleSelector: 'h3',
      priceSelector: '[data-testid="event-item-price"]'
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
