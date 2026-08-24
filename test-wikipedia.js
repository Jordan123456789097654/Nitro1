const https = require('https');

const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=Flappy+Bird&format=json&origin=*`;
const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.75 Safari/537.36'
  }
};

https.get(searchUrl, options, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Data length:', data.length);
    console.log('Data sample:', data.slice(0, 1000));
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
