const { chromium } = require('playwright');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

(async () => {
  console.log('====================================================');
  console.log('🔑 NAUKRI ONE-CLICK SESSION GENERATOR');
  console.log('====================================================\n');

  const sessionPath = path.join(__dirname, 'session.json');

  console.log('Launching browser to log into Naukri...');
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--start-maximized']
  }).catch(async () => {
    return await chromium.launch({ headless: false, args: ['--start-maximized'] });
  });

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  console.log('Navigating to Naukri login page...');
  await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded' });

  console.log('\n👉 Instructions:');
  console.log('1. Log into your Naukri account (using OTP / Password).');
  console.log('2. Once your profile dashboard is visible, return here.');
  console.log('3. Press [ENTER] in this terminal to save session cookies.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => rl.question('Press ENTER after logging in: ', () => resolve()));
  rl.close();

  console.log('Saving authentication state to session.json...');
  await context.storageState({ path: sessionPath });

  console.log('\n✅ SUCCESS: session.json generated successfully!');
  console.log(`File saved at: ${sessionPath}`);
  console.log('You can now add this content to GitHub Secret "NAUKRI_SESSION_JSON".\n');

  await browser.close();
})();
