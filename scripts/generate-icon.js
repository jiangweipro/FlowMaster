const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const svgPath = path.join(__dirname, '..', 'media', 'icon.svg');
const pngPath = path.join(__dirname, '..', 'media', 'icon.png');

const svg = fs.readFileSync(svgPath, 'utf-8');
const resvg = new Resvg(svg, {
  fitTo: {
    mode: 'width',
    value: 128,
  },
});
const pngData = resvg.render();
const pngBuffer = pngData.asPng();

fs.writeFileSync(pngPath, pngBuffer);
console.log(`Generated ${pngPath}`);
