/**
 * Cloudflare Cron Scheduler for GitHub Actions Workflows
 * Triggers workflow_dispatch on exact IST schedule (bypassing GitHub's flaky cron queue).
 */

const CRON_TARGETS = {
  "25,40 3 * * *": [
    { repo: "profile-sync", workflow: "naukri-sync.yml", ref: "main" }
  ],
  "30 2-15 * * *": [
    { repo: "naukri-job-alerts", workflow: "job-alert.yml", ref: "main" }
  ]
};

async function dispatchWorkflow(env, { repo, workflow, ref }) {
  const token = (env?.GITHUB_TOKEN || "").trim();
  const owner = (env?.GITHUB_OWNER || "SuperStricker").trim();
  if (!token) {
    throw new Error("Missing GITHUB_TOKEN secret in Cloudflare Worker");
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;
  const body = JSON.stringify({ ref });

  let resp = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "User-Agent": "Cloudflare-Naukri-Scheduler",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body
    });

    if (resp.ok) {
      return { ok: true, status: resp.status, repo, workflow };
    }
    if (resp.status !== 429 && resp.status < 500) {
      break;
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }

  const errText = resp ? await resp.text() : "No response";
  throw new Error(`Dispatch failed for ${owner}/${repo}/${workflow}: ${resp?.status} ${errText}`);
}

async function runCronTargets(env, cron) {
  const targets = CRON_TARGETS[cron] || [];
  if (targets.length === 0) {
    return { dispatched: [], warning: `No targets mapped for cron "${cron}"` };
  }
  const results = await Promise.all(targets.map((target) => dispatchWorkflow(env, target)));
  for (const res of results) {
    console.log(`Dispatched ${res.repo}/${res.workflow} -> HTTP ${res.status}`);
  }
  return { dispatched: results };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/trigger") {
      const secret = (env?.DISPATCH_SECRET || "").trim();
      const provided = (request.headers.get("x-trigger-key") || "").trim();
      if (!secret || provided !== secret) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
      const cron = url.searchParams.get("cron") || "";
      try {
        const result = await runCronTargets(env, cron);
        return new Response(JSON.stringify({ ok: true, cron, ...result }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response(
      JSON.stringify({
        service: "naukri-cloud-scheduler",
        status: "LIVE",
        schedules_ist: {
          profile_sync: "08:55 AM & 09:10 AM IST daily (25,40 3 * * * UTC)",
          job_alerts: "08:00 AM - 09:00 PM IST hourly (30 2-15 * * * UTC)"
        }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }
    );
  },

  async scheduled(controller, env, ctx) {
    const work = runCronTargets(env, controller.cron);
    ctx.waitUntil(work);
    await work;
  }
};
