const https = require('https');

function getVqd(query) {
  return new Promise((resolve) => {
    const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Find vqd matches
        const regex = /vqd=['"]?([^"'\s>]+)['"]?/g;
        let match;
        while ((match = regex.exec(data)) !== null) {
          if (match[1].indexOf('-') !== -1) {
            return resolve(match[1]);
          }
        }
        resolve(null);
      });
    }).on('error', () => resolve(null));
  });
}

function searchDdgImages(query, vqd) {
  return new Promise((resolve) => {
    const url = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36',
        'Referer': 'https://duckduckgo.com/'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', () => resolve(''));
  });
}

async function run() {
  const query = 'subway surfers game logo';
  const vqd = await getVqd(query);
  console.log('vqd found:', vqd);
  if (!vqd) return;

  const data = await searchDdgImages(query, vqd);
  console.log('Raw output snippet:', data.slice(0, 1000));
}

run();
