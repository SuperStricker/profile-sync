const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

(async () => {
  console.log('====================================================');
  console.log('🚀 NAUKRI PROFILE AUTO-SYNC BOT');
  console.log('Timestamp:', new Date().toISOString());
  console.log('====================================================\n');

  const sessionPath = path.join(__dirname, 'session.json');

  // 1. If NAUKRI_SESSION_JSON is available from Secret, write it
  if (process.env.NAUKRI_SESSION_JSON && process.env.NAUKRI_SESSION_JSON.trim()) {
    console.log('Detected NAUKRI_SESSION_JSON environment secret. Writing session.json...');
    fs.writeFileSync(sessionPath, process.env.NAUKRI_SESSION_JSON.trim(), 'utf8');
  }

  const hasSession = fs.existsSync(sessionPath);
  const username = process.env.NAUKRI_USERNAME ? process.env.NAUKRI_USERNAME.trim() : '';
  const password = process.env.NAUKRI_PASSWORD ? process.env.NAUKRI_PASSWORD.trim() : '';

  if (!hasSession && (!username || !password)) {
    console.error('❌ ERROR: Neither session cookies nor login credentials were provided!');
    console.error('Please configure NAUKRI_USERNAME & NAUKRI_PASSWORD (or NAUKRI_SESSION_JSON) in GitHub Repository Secrets.');
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

  // 3. Launch browser (Stealth mode)
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

  const contextOptions = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    locale: 'en-US'
  };

  if (hasSession) {
    console.log('Using stored session cookies for authentication.');
    contextOptions.storageState = sessionPath;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  // Strip navigator.webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    // If no existing session, log in directly via credentials
    if (!hasSession && username && password) {
      console.log(`Performing direct automated login for ${username}...`);
      await page.goto('https://www.naukri.com/nlogin/login', {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      await page.waitForTimeout(2000);

      const userSelector = '#usernameField, input[placeholder*="Email"], input[name="email"]';
      const passSelector = '#passwordField, input[placeholder*="Password"], input[name="password"]';

      await page.waitForSelector(userSelector, { timeout: 15000 });
      await page.fill(userSelector, username);
      await page.fill(passSelector, password);

      const loginBtn = page.locator('button.btn-primary[type="submit"], button:has-text("Login")').first();
      await loginBtn.click();
      console.log('Credentials submitted. Waiting for dashboard navigation...');

      await page.waitForURL('**/mnjuser/**', { timeout: 30000 }).catch(async () => {
        await page.waitForTimeout(6000);
      });
      console.log('Post-login URL:', page.url());
    }

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
      throw new Error('Login failed or session expired. Please verify NAUKRI_USERNAME & NAUKRI_PASSWORD in GitHub Secrets.');
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
        const uploadRespPromise = page.waitForResponse(
          (res) => /file|upload|resume|cv/i.test(res.url()) && ['POST', 'PUT'].includes(res.request().method()),
          { timeout: 15000 }
        ).catch(() => null);

        await attachInput.setInputFiles(resumePath);
        console.log('Resume file submitted. Waiting for upload confirmation...');

        const uploadResp = await uploadRespPromise;
        if (uploadResp) {
          console.log(`Upload HTTP response: ${uploadResp.status()} (${uploadResp.url()})`);
          if (uploadResp.status() >= 400) {
            throw new Error(`Resume upload HTTP error: ${uploadResp.status()}`);
          }
        }

        // Wait for Naukri UI toast or updated date text to settle
        await page.waitForTimeout(4000);
        const pageVerify = await page.evaluate(() => {
          const text = document.body ? document.body.innerText : '';
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          return {
            lastUpdated: lines.find(l => /profile last updated/i.test(l)) || '',
            uploadedOn: lines.find(l => /uploaded on/i.test(l)) || '',
            hasSuccessText: /successfully uploaded|resume.*updated/i.test(text)
          };
        });
        console.log('Post-upload profile status:', JSON.stringify(pageVerify));

        if (!uploadResp && !pageVerify.hasSuccessText && !/today/i.test(pageVerify.lastUpdated)) {
          throw new Error('Could not verify Naukri resume upload confirmation on profile page.');
        }

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
