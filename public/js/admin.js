'use strict';

(function () {
  const el = (id) => document.getElementById(id);
  let adminPassword = null;
  let timer = null;

  function showMsg(text, kind) {
    const node = el('gate-msg');
    node.textContent = text;
    node.className = 'msg show ' + (kind || 'error');
  }

  async function fetchStats() {
    const res = await fetch('/api/admin/stats', {
      headers: { 'x-admin-password': adminPassword }
    });
    if (res.status === 401) {
      throw new Error('Wrong password.');
    }
    if (!res.ok) {
      throw new Error('Could not load stats.');
    }
    return res.json();
  }

  function fmtTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString();
  }

  function labelForType(type) {
    const map = {
      signup: 'Sign-up',
      login: 'Login',
      login_failed: 'Failed login',
      plan_selected: 'Plan selected'
    };
    return map[type] || type;
  }

  function renderStats(s) {
    const t = s.totals;
    el('stats').innerHTML = `
      ${stat(t.users, 'Registered guests')}
      ${stat(t.signups, 'Sign-ups')}
      ${stat(t.logins, 'Successful logins')}
      ${stat(t.planSelections, 'Plans selected')}
      ${stat('$' + t.estimatedRevenue, 'Est. fiber revenue')}
      ${stat(t.failedLogins, 'Failed logins')}
    `;

    renderBars('plan-bars', s.planCounts, 'No plans selected yet.');
    renderBars('payment-bars', s.paymentCounts, 'No paid plans yet.');
    renderBars('signup-bars', s.signupsByDay, 'No sign-ups yet.');

    renderActivity(s.recent);
  }

  function stat(value, label) {
    return `<div class="stat"><div class="value">${value}</div><div class="label">${label}</div></div>`;
  }

  function renderBars(containerId, counts, emptyText) {
    const container = el(containerId);
    const entries = Object.entries(counts || {});
    if (!entries.length) {
      container.innerHTML = `<p class="subtitle" style="margin:0">${emptyText}</p>`;
      return;
    }
    const max = Math.max(...entries.map(([, v]) => v));
    container.innerHTML = entries
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => {
        const pct = max ? Math.round((value / max) * 100) : 0;
        return `
          <div class="bar-row">
            <div class="bar-label">${label}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
            <div class="bar-count">${value}</div>
          </div>`;
      })
      .join('');
  }

  function renderActivity(recent) {
    const body = el('activity-body');
    if (!recent || !recent.length) {
      body.innerHTML = '<tr><td colspan="5" class="subtitle">No activity yet.</td></tr>';
      return;
    }
    body.innerHTML = recent
      .map((e) => {
        const pay = e.payment ? e.payment : '—';
        const plan = e.plan ? e.plan : '—';
        return `
          <tr>
            <td>${fmtTime(e.createdAt)}</td>
            <td><span class="pill ${e.type}">${labelForType(e.type)}</span></td>
            <td>${e.username || '—'}</td>
            <td>${plan}</td>
            <td>${pay}</td>
          </tr>`;
      })
      .join('');
  }

  async function refresh() {
    try {
      const stats = await fetchStats();
      renderStats(stats);
    } catch (err) {
      // If the password stopped working, send back to the gate.
      clearInterval(timer);
      el('dashboard').classList.add('hidden');
      el('gate').classList.remove('hidden');
      showMsg(err.message);
    }
  }

  el('gate-btn').addEventListener('click', async () => {
    adminPassword = el('admin-pass').value;
    if (!adminPassword) {
      return showMsg('Please enter the password.');
    }
    try {
      const stats = await fetchStats();
      el('gate').classList.add('hidden');
      el('dashboard').classList.remove('hidden');
      renderStats(stats);
      timer = setInterval(refresh, 10000);
    } catch (err) {
      showMsg(err.message);
    }
  });

  el('admin-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('gate-btn').click();
  });

  el('refresh').addEventListener('click', refresh);
})();
