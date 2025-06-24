const puppeteer = require('puppeteer');
const fs = require('fs');

// 1. Scrape Vivid Seats
async function scrapeVividSeats() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto('https://www.vividseats.com/concert-tickets', { 
    waitUntil: 'networkidle2', timeout: 60000 
  });
  
  const data = await page.evaluate(() => {
    const events = [];
    document.querySelectorAll('.event-listing').forEach(el => {
      events.push({
        title: el.querySelector('.event-title')?.innerText.trim(),
        price: el.querySelector('.price')?.innerText.replace('$',''),
        url: el.href
      });
    });
    return events;
  });
  
  await browser.close();
  return data;
}

// 2. Scrape StubHub (similar structure)
async function scrapeStubHub() { ... } 

// 3. AI Analysis with OpenRouter
async function analyzeData(data) {
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
        content: `Analyze ticket data for arbitrage: ${JSON.stringify(data)}. 
          Identify events where: 
          - VividSeats price > StubHub price + 20% 
          - High demand events (keywords: 'sold out','limited')
          Format output: { opportunities: [...] }`
      }]
    })
  });
  return (await response.json()).choices[0].message.content;
}

// 4. Main Function
(async () => {
  const vividData = await scrapeVividSeats();
  const stubData = await scrapeStubHub();
  const combined = { vividSeats: vividData, stubHub: stubData, timestamp: new Date() };
  
  try {
    combined.analysis = JSON.parse(await analyzeData(combined));
  } catch (e) {
    combined.analysis = { error: "AI failed" };
  }
  
  fs.writeFileSync('data.json', JSON.stringify(combined));
})();
