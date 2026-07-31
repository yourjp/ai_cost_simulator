/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const dataMdPath = path.join(__dirname, '..', 'data.md');
const outputDir = path.join(__dirname, '..', 'src', 'components', 'calculator');
const outputPath = path.join(outputDir, 'dynamicData.json');

function parseData() {
  console.log('🤖 Parsing data.md for AI pricing dashboard updates...');

  if (!fs.existsSync(dataMdPath)) {
    console.error(`❌ Error: data.md not found at ${dataMdPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(dataMdPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const metadata = {
    dataUpdatedAt: ''
  };

  const pricingData = [];
  const performanceData = {};
  const newsData = {
    OpenAI: [],
    Anthropic: [],
    Google: []
  };
  const trendData = {
    high: [],
    mid: []
  };

  let currentSection = ''; // 'pricing', 'performance', 'news', 'trend'

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('데이터 업데이트:') || trimmed.startsWith('데이터 업데이트 일시:')) {
      metadata.dataUpdatedAt = trimmed.replace(/^데이터 업데이트(?: 일시)?:/, '').trim();
      continue;
    }

    // Detect section titles
    if (trimmed.startsWith('###')) {
      if (trimmed.includes('요금')) {
        currentSection = 'pricing';
      } else if (trimmed.includes('성능') || trimmed.includes('스펙')) {
        currentSection = 'performance';
      } else if (trimmed.includes('뉴스') || trimmed.includes('타임라인')) {
        currentSection = 'news';
      } else if (trimmed.includes('가격 추이') || trimmed.includes('가격 추세')) {
        currentSection = 'trend';
      }
      continue;
    }

    // Process table lines
    if (trimmed.startsWith('|')) {
      const parts = trimmed.split('|').map(p => p.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      
      // Skip table headers and separator lines
      if (parts.length === 0) continue;
      if (
        parts[0] === '' ||
        parts[0].includes('제공사') ||
        parts[0].includes('모델명') ||
        parts[0].includes('등급') ||
        parts[0].startsWith(':') ||
        parts[0].startsWith('-')
      ) {
        continue;
      }

      // Check section type and parse
      if (currentSection === 'pricing') {
        if (parts.length >= 5) {
          const provider = parts[0];
          const modelName = parts[1];
          const tier = parts[2];
          const inputCost = parseFloat(parts[3].replace(/[$,\s]/g, ''));
          const outputCost = parseFloat(parts[4].replace(/[$,\s]/g, ''));

          if (provider && modelName && tier && !isNaN(inputCost) && !isNaN(outputCost)) {
            pricingData.push({
              modelName,
              provider,
              tier,
              inputCostPer1M: inputCost,
              outputCostPer1M: outputCost
            });
          }
        }
      } else if (currentSection === 'performance') {
        if (parts.length >= 5) {
          const modelName = parts[0];
          const context = parts[1];
          const maxOutput = parts[2];
          const valsIndex = parts[3];
          const features = parts[4];

          if (modelName) {
            performanceData[modelName] = {
              context,
              maxOutput,
              valsIndex,
              features
            };
          }
        }
      } else if (currentSection === 'news') {
        if (parts.length >= 4) {
          const provider = parts[0];
          const date = parts[1];
          const headline = parts[2];
          const detail = parts[3];

          if (provider && newsData[provider]) {
            newsData[provider].push({
              date,
              headline,
              content: detail
            });
          }
        }
      } else if (currentSection === 'trend') {
        if (parts.length >= 5) {
          const tier = parts[0];
          const date = parts[1];
          const openai = parseFloat(parts[2].replace(/[$,\s]/g, ''));
          const anthropic = parseFloat(parts[3].replace(/[$,\s]/g, ''));
          const google = parseFloat(parts[4].replace(/[$,\s]/g, ''));

          if ((tier === 'high' || tier === 'mid') && date && !isNaN(openai) && !isNaN(anthropic) && !isNaN(google)) {
            trendData[tier].push({
              date,
              week: date.slice(5).replace('-', '/'),
              OpenAI: openai,
              Anthropic: anthropic,
              Google: google
            });
          }
        }
      }
    }
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save the structured JSON
  const outputJson = {
    metadata,
    pricingData,
    performanceData,
    newsData,
    trendData
  };

  fs.writeFileSync(outputPath, JSON.stringify(outputJson, null, 2), 'utf8');
  console.log(`✅ Success: dynamicData.json generated successfully at ${outputPath}`);
  console.log(`📊 Parsed Models: ${pricingData.length} | Specs: ${Object.keys(performanceData).length} | News: ${Object.values(newsData).flat().length} | Trends: ${trendData.high.length + trendData.mid.length}`);
}

parseData();
