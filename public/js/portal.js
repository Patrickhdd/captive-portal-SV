'use strict';

(function () {
  const state = {
    username: null,
    config: null,
    selectedPlan: null,
    selectedPayment: null
  };

  const el = (id) => document.getElementById(id);

  const cards = {
    login: el('login-card'),
    signup: el('signup-card'),
    plan: el('plan-card'),
    done: el('done-card')
  };

  function show(card) {
    Object.values(cards).forEach((c) => c.classList.add('hidden'));
    cards[card].classList.remove('hidden');
  }

  function showMsg(node, text, kind) {
    node.textContent = text;
    node.className = 'msg show ' + (kind || 'error');
  }

  function clearMsg(node) {
    node.className = 'msg';
    node.textContent = '';
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong. Please try again.');
    }
    return data;
  }

  // -------------------------------------------------------------------------
  // Load plan + payment config
  // -------------------------------------------------------------------------
  async function loadConfig() {
    const res = await fetch('/api/config');
    state.config = await res.json();
  }

  // -------------------------------------------------------------------------
  // Auth toggles
  // -------------------------------------------------------------------------
  el('to-signup').addEventListener('click', () => {
    clearMsg(el('login-msg'));
    show('signup');
  });
  el('to-login').addEventListener('click', () => {
    clearMsg(el('signup-msg'));
    show('login');
  });

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------
  el('login-btn').addEventListener('click', async () => {
    const username = el('login-username').value.trim();
    const password = el('login-password').value;
    clearMsg(el('login-msg'));
    if (!username || !password) {
      return showMsg(el('login-msg'), 'Please enter your username and password.');
    }
    try {
      const data = await api('/api/login', { username, password });
      state.username = data.username;
      enterPlanStep();
    } catch (err) {
      showMsg(el('login-msg'), err.message);
    }
  });

  // -------------------------------------------------------------------------
  // Sign up
  // -------------------------------------------------------------------------
  el('signup-btn').addEventListener('click', async () => {
    const fullName = el('signup-fullname').value.trim();
    const roomNumber = el('signup-room').value.trim();
    const username = el('signup-username').value.trim();
    const password = el('signup-password').value;
    clearMsg(el('signup-msg'));
    if (!username || !password) {
      return showMsg(el('signup-msg'), 'Please choose a username and password.');
    }
    try {
      const data = await api('/api/signup', { username, password, fullName, roomNumber });
      state.username = data.username;
      enterPlanStep();
    } catch (err) {
      showMsg(el('signup-msg'), err.message);
    }
  });

  // -------------------------------------------------------------------------
  // Plan step
  // -------------------------------------------------------------------------
  function enterPlanStep() {
    el('current-user').textContent = state.username;
    renderPlans();
    renderPayments();
    show('plan');
  }

  function renderPlans() {
    const container = el('plans');
    container.innerHTML = '';
    state.config.plans.forEach((plan) => {
      const card = document.createElement('div');
      card.className = 'plan';
      card.dataset.planId = plan.id;
      const priceHtml =
        plan.amount > 0
          ? `<div class="price">$${plan.amount}</div>`
          : `<div class="price"><span class="free-label">Free</span></div>`;
      card.innerHTML = `
        <span class="tag ${plan.type}">${plan.type === 'free' ? 'Complimentary' : 'Fiber Optic'}</span>
        <h3>${plan.name}</h3>
        <div class="speed">${plan.speed}</div>
        <p class="desc">${plan.description}</p>
        ${priceHtml}
      `;
      card.addEventListener('click', () => selectPlan(plan));
      container.appendChild(card);
    });
  }

  function selectPlan(plan) {
    state.selectedPlan = plan;
    state.selectedPayment = null;
    document.querySelectorAll('.plan').forEach((p) => {
      p.classList.toggle('selected', p.dataset.planId === plan.id);
    });
    document.querySelectorAll('.pay').forEach((p) => p.classList.remove('selected'));

    // Free plan: no payment needed.
    if (plan.type === 'free') {
      el('payment-step').classList.add('hidden');
    } else {
      el('payment-step').classList.remove('hidden');
    }
    updateConfirmState();
  }

  function renderPayments() {
    const container = el('pay-methods');
    container.innerHTML = '';
    const icons = { wish: '📲', cash: '💵' };
    state.config.paymentMethods.forEach((method) => {
      const node = document.createElement('div');
      node.className = 'pay';
      node.dataset.payId = method.id;
      node.innerHTML = `
        <div class="icon">${icons[method.id] || '💳'}</div>
        <div class="name">${method.name}</div>
      `;
      node.addEventListener('click', () => {
        state.selectedPayment = method;
        document.querySelectorAll('.pay').forEach((p) => {
          p.classList.toggle('selected', p.dataset.payId === method.id);
        });
        updateConfirmState();
      });
      container.appendChild(node);
    });
  }

  function updateConfirmState() {
    const btn = el('confirm-btn');
    if (!state.selectedPlan) {
      btn.disabled = true;
      return;
    }
    if (state.selectedPlan.type !== 'free' && !state.selectedPayment) {
      btn.disabled = true;
      return;
    }
    btn.disabled = false;
  }

  el('confirm-btn').addEventListener('click', async () => {
    clearMsg(el('plan-msg'));
    if (!state.selectedPlan) return;
    try {
      const data = await api('/api/select-plan', {
        username: state.username,
        planId: state.selectedPlan.id,
        paymentId: state.selectedPayment ? state.selectedPayment.id : null
      });
      finish(data);
    } catch (err) {
      showMsg(el('plan-msg'), err.message);
    }
  });

  el('logout').addEventListener('click', () => {
    state.username = null;
    state.selectedPlan = null;
    state.selectedPayment = null;
    show('login');
  });

  // -------------------------------------------------------------------------
  // Done — redirect to the hotel website
  // -------------------------------------------------------------------------
  function finish(data) {
    const parts = [data.plan];
    if (data.payment) parts.push('Payment: ' + data.payment);
    if (data.amount > 0) parts.push('$' + data.amount);
    el('done-summary').textContent = parts.join(' · ');

    const url = data.redirectUrl;
    el('go-now').onclick = () => (window.location.href = url);
    show('done');
    setTimeout(() => {
      window.location.href = url;
    }, 3500);
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------
  loadConfig().catch(() => {
    showMsg(el('login-msg'), 'Could not load WiFi plans. Please refresh.');
  });
})();
