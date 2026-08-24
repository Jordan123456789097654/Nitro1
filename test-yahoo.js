const https = require('https');

function searchYahooImages(query) {
  return new Promise((resolve, reject) => {
    const url = `https://images.search.yahoo.com/search/images?p=${encodeURIComponent(query)}`;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36'
      }
    };

    https.get(url, options, (res) => {
      console.log('Yahoo Status Code:', res.statusCode);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Look for image URLs. Yahoo Images raw HTML embeds URLs in metadata JSON or direct src
        // Let's search for "iurl":"http..." or standard image formats
        const regex = /"iurl":"(https?:\/\/[^"]+)"/g;
        let matches = [];
        let match;
        while ((match = regex.exec(data)) !== null) {
          matches.push(match[1].replace(/\\/g, ''));
        }
        resolve(matches);
      });
    }).on('error', err => reject(err));
  });
}

searchYahooImages('subway surfers game logo')
  .then(urls => {
    console.log('Yahoo Matches found:', urls.slice(0, 5));
  })
  .catch(err => {
    console.error('Yahoo Error:', err.message);
  });
