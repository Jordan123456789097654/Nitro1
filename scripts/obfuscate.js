const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const jsDir = path.join(__dirname, '../public/js');
const distDir = path.join(__dirname, '../public/dist-js');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const obfuscationOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  numbersToExpressions: true,
  simplify: true,
  shuffleStringArray: true,
  splitStrings: true,
  stringArray: true,
  stringArrayThreshold: 0.8,
  stringArrayEncoding: ['base64', 'rc4'],
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
  selfDefending: false // Avoid strict self-defending crashing on ES modules
};

function obfuscateFiles() {
  console.log('🔒 [Security] Encrypting and obfuscating frontend scripts...');
  const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

  files.forEach(file => {
    const filePath = path.join(jsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    try {
      const obfuscated = JavaScriptObfuscator.obfuscate(content, obfuscationOptions);
      const outPath = path.join(distDir, file);
      fs.writeFileSync(outPath, obfuscated.getObfuscatedCode(), 'utf8');
      console.log(`  ✅ Encrypted & Protected: ${file} -> dist-js/${file}`);
    } catch (err) {
      console.error(`  ❌ Error obfuscating ${file}:`, err.message);
    }
  });

  console.log('🛡️ [Security] Frontend code obfuscation complete!');
}

obfuscateFiles();
