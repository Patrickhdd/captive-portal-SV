'use strict';

(function () {
  const el = (id) => document.getElementById(id);
  let adminPassword = null;
  let timer = null;

  // ---- helpers -------------------------------------------------------------
  function gateMsg(text, kind) {
    const node = el('gate-msg');
    node.textContent = text;
    node.className = 'msg show ' + (kind || 'error');
  }

  function flash(node, text, kind) {
    node.textContent = text;
    node.className = 'msg show ' + (kind || 'error');
    if (kind === 'ok') setTimeout(() => (node.className = 'msg'), 2500);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword,
        ...(options.headers || {})
      }
    });
    if (res.status === 401) throw new Error('Wrong password / session expired.');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  function fmtTime(iso) {
    return iso ? new Date(iso).toLocaleString() : '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
    );
  }

  // ---- tabs ----------------------------------------------------------------
  document.querySelectorAll('.tab').forEach((tab) => {
    if (tab.id === 'logout-btn') return;
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const name = tab.dataset.tab;
      ['overview', 'guests', 'plans'].forEach((p) => {
        el('tab-' + p).classList.toggle('hidden', p !== name);
      });
      if (name === 'guests') loadGuests();
      if (name === 'plans') loadPlans();
    });
  });

  el('logout-btn').addEventListener('click', () => {
    clearInterval(timer);
    adminPassword = null;
    el('app').classList.add('hidden');
    el('gate').classList.remove('hidden');
    el('admin-pass').value = '';
  });

  // ---- overview / stats ----------------------------------------------------
  function stat(value, label) {
    return `<div class="stat"><div class="value">${value}</div><div class="label">${label}</div></div>`;
  }

  function labelForType(type) {
    return (
      { signup: 'Sign-up', login: 'Login', login_failed: 'Failed login', plan_selected: 'Plan selected' }[
        type
      ] || type
    );
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
        return `<div class="bar-row"><div class="bar-label">${esc(label)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <div class="bar-count">${value}</div></div>`;
      })
      .join('');
  }

  function renderStats(s) {
    const t = s.totals;
    el('stats').innerHTML =
      stat(t.users, 'Registered guests') +
      stat(t.signups, 'Sign-ups') +
      stat(t.logins, 'Successful logins') +
      stat(t.planSelections, 'Plans selected') +
      stat('$' + t.estimatedRevenue, 'Est. fiber revenue') +
      stat(t.failedLogins, 'Failed logins');
    renderBars('plan-bars', s.planCounts, 'No plans selected yet.');
    renderBars('payment-bars', s.paymentCounts, 'No paid plans yet.');
    renderBars('signup-bars', s.signupsByDay, 'No sign-ups yet.');

    const body = el('activity-body');
    if (!s.recent || !s.recent.length) {
      body.innerHTML = '<tr><td colspan="5" class="subtitle">No activity yet.</td></tr>';
    } else {
      body.innerHTML = s.recent
        .map(
          (e) => `<tr>
            <td>${fmtTime(e.createdAt)}</td>
            <td><span class="pill ${e.type}">${labelForType(e.type)}</span></td>
            <td>${esc(e.username) || '—'}</td>
            <td>${esc(e.plan) || '—'}</td>
            <td>${esc(e.payment) || '—'}</td>
          </tr>`
        )
        .join('');
    }
  }

  async function refreshStats() {
    try {
      renderStats(await api('/api/admin/stats'));
    } catch (err) {
      backToGate(err.message);
    }
  }

  // ---- guests --------------------------------------------------------------
  async function loadGuests() {
    try {
      const { users } = await api('/api/admin/users');
      el('guest-count').textContent = users.length;
      const body = el('guests-body');
      if (!users.length) {
        body.innerHTML = '<tr><td colspan="5" class="subtitle">No guests yet.</td></tr>';
        return;
      }
      body.innerHTML = users
        .map(
          (u) => `<tr>
            <td>${esc(u.username)}</td>
            <td>${esc(u.fullName) || '—'}</td>
            <td>${esc(u.roomNumber) || '—'}</td>
            <td>${fmtTime(u.createdAt)}</td>
            <td><div class="row-actions">
              <button class="btn small danger" data-del-user="${u.id}" data-name="${esc(u.username)}">Delete</button>
            </div></td>
          </tr>`
        )
        .join('');
      body.querySelectorAll('[data-del-user]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm(`Delete guest "${b.dataset.name}"? This cannot be undone.`)) return;
          try {
            await api('/api/admin/users/' + b.dataset.delUser, { method: 'DELETE' });
            loadGuests();
          } catch (err) {
            flash(el('guest-msg'), err.message);
          }
        });
      });
    } catch (err) {
      backToGate(err.message);
    }
  }

  el('add-guest-btn').addEventListener('click', async () => {
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          username: el('g-username').value.trim(),
          password: el('g-password').value,
          fullName: el('g-fullname').value.trim(),
          roomNumber: el('g-room').value.trim()
        })
      });
      ['g-username', 'g-password', 'g-fullname', 'g-room'].forEach((id) => (el(id).value = ''));
      flash(el('guest-msg'), 'Guest added.', 'ok');
      loadGuests();
    } catch (err) {
      flash(el('guest-msg'), err.message);
    }
  });

  // ---- plans ---------------------------------------------------------------
  async function loadPlans() {
    try {
      const { plans } = await api('/api/admin/plans');
      const body = el('plans-body');
      if (!plans.length) {
        body.innerHTML = '<tr><td colspan="7" class="subtitle">No plans.</td></tr>';
        return;
      }
      body.innerHTML = plans
        .map(
          (p) => `<tr>
            <td>${p.sortOrder}</td>
            <td>${esc(p.name)}</td>
            <td>${p.type}</td>
            <td>${esc(p.speed)}</td>
            <td>${p.amount > 0 ? '$' + p.amount : 'Free'}</td>
            <td>${p.active ? '<span class="badge-yes">Yes</span>' : '<span class="badge-no">No</span>'}</td>
            <td><div class="row-actions">
              <button class="link-btn" data-edit-plan="${esc(p.id)}">Edit</button>
              <button class="btn small danger" data-del-plan="${esc(p.id)}" data-name="${esc(p.name)}">Delete</button>
            </div></td>
          </tr>`
        )
        .join('');

      body.querySelectorAll('[data-edit-plan]').forEach((b) => {
        b.addEventListener('click', () => {
          const p = plans.find((x) => x.id === b.dataset.editPlan);
          if (p) fillPlanForm(p);
        });
      });
      body.querySelectorAll('[data-del-plan]').forEach((b) => {
        b.addEventListener('click', async () => {
          if (!confirm(`Delete plan "${b.dataset.name}"?`)) return;
          try {
            await api('/api/admin/plans/' + encodeURIComponent(b.dataset.delPlan), { method: 'DELETE' });
            loadPlans();
          } catch (err) {
            flash(el('plan-msg'), err.message);
          }
        });
      });
    } catch (err) {
      backToGate(err.message);
    }
  }

  function fillPlanForm(p) {
    el('p-id').value = p.id;
    el('p-name').value = p.name;
    el('p-type').value = p.type;
    el('p-speed').value = p.speed;
    el('p-amount').value = p.amount;
    el('p-order').value = p.sortOrder;
    el('p-desc').value = p.description || '';
    el('p-active').checked = !!p.active;
    el('plan-msg').className = 'msg';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearPlanForm() {
    ['p-id', 'p-name', 'p-speed', 'p-amount', 'p-order', 'p-desc'].forEach((id) => (el(id).value = ''));
    el('p-type').value = 'fiber';
    el('p-active').checked = true;
  }

  el('clear-plan-btn').addEventListener('click', clearPlanForm);

  el('save-plan-btn').addEventListener('click', async () => {
    try {
      await api('/api/admin/plans', {
        method: 'POST',
        body: JSON.stringify({
          id: el('p-id').value.trim(),
          name: el('p-name').value.trim(),
          type: el('p-type').value,
          speed: el('p-speed').value.trim(),
          amount: Number(el('p-amount').value || 0),
          description: el('p-desc').value.trim(),
          sortOrder: Number(el('p-order').value || 0),
          active: el('p-active').checked
        })
      });
      flash(el('plan-msg'), 'Plan saved.', 'ok');
      clearPlanForm();
      loadPlans();
    } catch (err) {
      flash(el('plan-msg'), err.message);
    }
  });

  // ---- gate ----------------------------------------------------------------
  function backToGate(message) {
    clearInterval(timer);
    el('app').classList.add('hidden');
    el('gate').classList.remove('hidden');
    gateMsg(message);
  }

  async function enter() {
    el('gate').classList.add('hidden');
    el('app').classList.remove('hidden');
    await refreshStats();
    timer = setInterval(refreshStats, 10000);
  }

  el('gate-btn').addEventListener('click', async () => {
    adminPassword = el('admin-pass').value;
    if (!adminPassword) return gateMsg('Please enter the password.');
    try {
      await api('/api/admin/stats'); // validates the password
      enter();
    } catch (err) {
      gateMsg(err.message);
    }
  });

  el('admin-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('gate-btn').click();
  });

  el('refresh').addEventListener('click', refreshStats);
})();
