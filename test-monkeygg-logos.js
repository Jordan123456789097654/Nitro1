const https = require('https');

const games = [
  '1v1-lol',
  'eggy-car',
  'drift-boss',
  'drift-hunters',
  'subway-surfers',
  'cookie-clicker',
  'geometry-dash-lite',
  'retro-bowl'
];

function checkUrl(url) {
  return new Promise((resolve) => {
    https.request(url, { method: 'HEAD' }, (res) => {
      resolve(res.statusCode);
    }).on('error', () => {
      resolve(500);
    }).end();
  });
}

async function run() {
  for (const g of games) {
    const url = `https://monkeygg2.github.io/games/${g}/logo.png`;
    const code = await checkUrl(url);
    console.log(`Game: ${g} -> Logo.png status: ${code}`);
  }
}

run();
