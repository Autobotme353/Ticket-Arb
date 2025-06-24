const puppeteer = require('puppeteer');
const fs = require('fs');

// 1. Scrape Vivid Seats
async function scrapeVividSeats() {
  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('https://www.vividseats.com/concert-tickets', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });
  
  const data = await page.evaluate(() => {
    const events = [];
    document.querySelectorAll('.EventCard').forEach(el => {
      events.push({
        title: el.querySelector('h3')?.innerText.trim() || 'N/A',
        price: el.querySelector('[data-testid="event-card-price"]')?.innerText.replace('$', '') || '0',
        url: window.location.href
      });
    });
    return events;
  });
  
  await browser.close();
  return data;
}

// 2. Scrape StubHub
async function scrapeStubHub() {
  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('https://www.stubhub.com/find/s/?q=concerts', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });
  
  const data = await page.evaluate(() => {
    const events = [];
    document.querySelectorAll('.EventItem').forEach(el => {
      events.push({
        title: el.querySelector('h3')?.innerText.trim() || 'N/A',
        price: el.querySelector('[data-testid="event-item-price"]')?.innerText.replace(/\$|,/g, '') || '0',
        url: el.querySelector('a')?.href || window.location.href
      });
    });
    return events;
  });
  
  await browser.close();
  return data;
}

// 3. AI Analysis with OpenRouter
async function analyzeData(data) {
  try {
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
          content: `Analyze these ticket prices for arbitrage opportunities:\n${JSON.stringify(data)}\n\n` +
                   `Identify events where:\n` +
                   `1. Price difference between platforms >20%\n` +
                   `2. Events with "sold out" or "limited" tags\n` +
                   `Format output as JSON: { opportunities: [{ event, buyFrom, buyPrice, sellTo, sellPrice, profit, margin }] }`
        }]
      })
    });
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const result = await response.json();
    return result.choices[0].message.content;
  } catch (e) {
    console.error('AI analysis failed:', e);
    return '{"opportunities": []}';
  }
}

// 4. Main Function
(async () => {
  try {
    console.log('Starting scraping...');
    const vividData = await scrapeVividSeats();
    console.log(`Scraped ${vividData.length} events from Vivid Seats`);
    
    const stubData = await scrapeStubHub();
    console.log(`Scraped ${stubData.length} events from StubHub`);
    
    const combined = {
      vividSeats: vividData,
      stubHub: stubData,
      timestamp: new Date().toISOString()
    };
    
    console.log('Analyzing data with AI...');
    const analysis = await analyzeData(combined);
    combined.analysis = JSON.parse(analysis);
    
    fs.writeFileSync('data.json', JSON.stringify(combined, null, 2));
    console.log('Data saved to data.json');
  } catch (error) {
    console.error('Fatal error:', error);
    // Save error information for debugging
    fs.writeFileSync('data.json', JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    }, null, 2));
  }
})();
