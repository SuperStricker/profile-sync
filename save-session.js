const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

(async () => {
  console.log('====================================================');
  console.log('🔑 NAUKRI 1-CLICK CLOUD SYNC CONNECTOR');
  console.log('====================================================\n');

  const sessionPath = path.join(__dirname, 'session.json');

  console.log('Launching browser window...');
  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--start-maximized']
    });
  } catch (e) {
    browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  }

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  console.log('Navigating to Naukri Login...');
  await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded' });

  console.log('\n👉 BROWSER MEIN APNA NAUKRI ACCOUNT LOGIN KAREIN:');
  console.log('   (Email & Password ya OTP se)');
  console.log('   Jaise hi login complete hoga, yeh tool automatically');
  console.log('   cookies capture karke GitHub Cloud par upload kar dega!\n');
  console.log('Waiting for login...');

  // Auto-detect successful login
  let loggedIn = false;
  const startTime = Date.now();
  while (Date.now() - startTime < 300000) { // 5 minutes timeout
    const currentUrl = page.url();
    if (
      currentUrl.includes('/mnjuser/homepage') ||
      currentUrl.includes('/mnjuser/profile') ||
      currentUrl.includes('/mynaukri')
    ) {
      console.log('\n✅ Login detected! URL:', currentUrl);
      loggedIn = true;
      break;
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  if (!loggedIn) {
    console.log('Checking cookies anyway...');
  }

  // Small delay to let all session cookies settle
  await new Promise(r => setTimeout(r, 3000));

  console.log('Capturing authentication session state...');
  await context.storageState({ path: sessionPath });
  console.log('✅ session.json saved successfully!');

  await browser.close();

  // Automatically upload to GitHub Secret
  console.log('\n🚀 Uploading session secret to GitHub repo (SuperStricker/profile-sync)...');
  try {
    execSync(`gh secret set NAUKRI_SESSION_JSON -R SuperStricker/profile-sync < "${sessionPath}"`, { stdio: 'inherit' });
    console.log('✅ GitHub Secret "NAUKRI_SESSION_JSON" successfully configured on cloud!');

    console.log('\n⚡ Triggering test run on GitHub Actions cloud...');
    execSync('gh workflow run naukri-sync.yml -R SuperStricker/profile-sync', { stdio: 'inherit' });
    console.log('🎉 100% COMPLETE! GitHub Cloud test run has been triggered.');
  } catch (err) {
    console.error('Notice during GitHub sync:', err.message);
  }

  console.log('\nPress any key to exit...');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', () => process.exit(0));
})();
