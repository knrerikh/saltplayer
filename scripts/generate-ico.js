const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

const inputFile = path.join(__dirname, '../assets/icon.png');
const outputFile = path.join(__dirname, '../build/icon.ico');

// png-to-ico exports the function directly as default export in some versions,
// or as a property. Let's check how it's exported.
const convert = pngToIco.default || pngToIco;

convert(inputFile)
  .then(buf => {
    fs.writeFileSync(outputFile, buf);
    console.log('Successfully generated icon.ico');
  })
  .catch(err => {
    console.error('Error generating icon.ico:', err);
    process.exit(1);
  });
