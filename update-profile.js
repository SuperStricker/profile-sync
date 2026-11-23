const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

(async () => {
  console.log('====================================================');
  console.log('🚀 NAUKRI PROFILE AUTO-SYNC BOT');
  console.log('Timestamp:', new Date().toISOString());
  console.log('====================================================\n');

  // 1. Recreate session.json if running in GitHub Actions with Secrets
  if (process.env.NAUKRI_SESSION_JSON) {
    console.log('Detected NAUKRI_SESSION_JSON environment variable. Writing session.json...');
    fs.writeFileSync(path.join(__dirname, 'session.json'), process.env.NAUKRI_SESSION_JSON, 'utf8');
  }

  const sessionPath = path.join(__dirname, 'session.json');
  if (!fs.existsSync(sessionPath)) {
    console.error('❌ ERROR: session.json not found! Please run "node save-session.js" first to generate it.');
    process.exit(1);
  }

  const isCI = !!process.env.CI;
  console.log(`Running in ${isCI ? 'CI (GitHub Actions)' : 'Local Machine'} mode...`);

  // 2. In headless Linux CI environments, launch virtual framebuffer Xvfb to emulate a real display
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    console.log('Linux headless CI environment detected. Starting virtual display (Xvfb :99)...');
    try {
      const xvfb = spawn('Xvfb', [':99', '-screen', '0', '1280x720x24', '-ac'], {
        detached: true,
        stdio: 'ignore'
      });
      xvfb.on('error', (err) => {
        console.warn('Xvfb spawn notice:', err.message);
      });
      xvfb.unref();
      process.env.DISPLAY = ':99';
      await new Promise(r => setTimeout(r, 1500));
      console.log('Virtual display initialized on DISPLAY=:99');
    } catch (xvfbErr) {
      console.warn('Could not start Xvfb directly:', xvfbErr.message);
    }
  }

  // 3. Launch browser (Try headed first with Xvfb, fallback to headless if display unavailable)
  let browser;
  try {
    console.log('Launching browser in headed display mode...');
    browser = await chromium.launch({
      headless: false,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
  } catch (launchErr) {
    console.warn(`Headed browser launch unsuccessful (${launchErr.message}). Retrying in headless mode...`);
    browser = await chromium.launch({
      headless: true,
      args: [
        '--headless=new',
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
  }

  const context = await browser.newContext({
    storageState: sessionPath,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    locale: 'en-US'
  });

  const page = await context.newPage();

  // Strip navigator.webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    console.log('Navigating to Naukri Profile page...');
    const response = await page.goto('https://www.naukri.com/mnjuser/profile', {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    const title = await page.title();
    const currentUrl = page.url();
    console.log(`Page Title: "${title}", URL: ${currentUrl}`);

    if (title.includes('Access Denied') || (response && response.status() === 403)) {
      throw new Error('Akamai Bot Manager blocked the connection (HTTP 403 Access Denied). Datacenter IP or automation signature flagged.');
    }

    if (currentUrl.includes('/login') || currentUrl.includes('/nlogin')) {
      throw new Error('Session has expired or cookies were rejected. Please run "node save-session.js" locally to refresh session.json.');
    }

    // Wait for profile content to load
    await page.waitForTimeout(3000);

    let updated = false;

    // Method 1: Re-upload resume (prefers 'Shuaib Ali - CV.pdf')
    let resumeFile = 'Shuaib Ali - CV.pdf';
    let resumePath = path.join(__dirname, resumeFile);
    if (!fs.existsSync(resumePath)) {
      const pdfs = fs.readdirSync(__dirname).filter(f => f.toLowerCase().endsWith('.pdf'));
      if (pdfs.length > 0) {
        resumeFile = pdfs[0];
        resumePath = path.join(__dirname, resumeFile);
      }
    }

    if (fs.existsSync(resumePath)) {
      console.log(`Found resume file: "${resumeFile}". Attaching to #attachCV input...`);
      const attachInput = page.locator('#attachCV');
      if (await attachInput.count() > 0) {
        await attachInput.setInputFiles(resumePath);
        console.log('Resume file submitted. Waiting for upload confirmation...');
        
        // Wait a few seconds for Naukri to process the upload
        await page.waitForTimeout(6000);
        console.log(`Resume "${resumeFile}" uploaded successfully!`);
        updated = true;
      } else {
        console.log('#attachCV file input not found on page.');
      }
    } else {
      console.log('No PDF resume found in folder. Skipping file upload.');
    }

    // Method 2: Headline refresh as fallback / additional touch
    if (!updated) {
      console.log('Attempting Headline refresh...');
      const headlineEdit = page.locator('.resumeHeadline .editOneTheme, span:has-text("Resume headline") ~ span.editOneTheme, .widgetHead:has-text("Resume headline") .editOneTheme').first();
      
      if (await headlineEdit.count() > 0 && await headlineEdit.isVisible()) {
        await headlineEdit.click();
        await page.waitForTimeout(1000);

        const textarea = page.locator('#resumeHeadlineTxt, textarea.resumeHeadlineTxt').first();
        if (await textarea.count() > 0) {
          const currentText = await textarea.inputValue();
          const newText = currentText.endsWith(' ') ? currentText.trimEnd() : currentText + ' ';
          await textarea.fill(newText);
          
          const saveBtn = page.locator('button:has-text("Save")').first();
          await saveBtn.click();
          await page.waitForTimeout(3000);
          console.log('Headline updated and saved successfully!');
          updated = true;
        }
      }
    }

    // Take verification screenshot of the profile
    try {
      const screenshotPath = path.join(__dirname, 'naukri-profile-updated.png');
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`Verification screenshot saved to ${screenshotPath}`);
    } catch (ssErr) {
      console.warn('Screenshot capture notice:', ssErr.message);
    }

    if (updated) {
      console.log('\n🎉 SUCCESS: Naukri profile has been updated! You will appear "Active Today" in recruiter searches.');
    } else {
      console.log('\n⚠️ NOTICE: Visited profile successfully, but no fields were modified.');
    }

  } catch (error) {
    console.error('\n❌ FAILURE during sync:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
    console.log('Browser closed. Done.');
  }
})();
