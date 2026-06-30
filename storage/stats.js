'use strict';

// Builds the marketing-dashboard payload from the raw event list + user count.
// Shared by every storage driver so the dashboard behaves identically no
// matter where the data lives.
function computeStats(events, userCount) {
  const count = (type) => events.filter((e) => e.type === type).length;

  const planCounts = {};
  const paymentCounts = {};
  let estimatedRevenue = 0;

  events
    .filter((e) => e.type === 'plan_selected')
    .forEach((e) => {
      if (e.plan) planCounts[e.plan] = (planCounts[e.plan] || 0) + 1;
      if (e.payment) paymentCounts[e.payment] = (paymentCounts[e.payment] || 0) + 1;
      if (typeof e.amount === 'number') estimatedRevenue += e.amount;
    });

  const signupsByDay = {};
  events
    .filter((e) => e.type === 'signup')
    .forEach((e) => {
      const day = (e.createdAt || '').slice(0, 10);
      if (day) signupsByDay[day] = (signupsByDay[day] || 0) + 1;
    });

  const recent = events
    .slice(-50)
    .reverse()
    .map((e) => ({
      type: e.type,
      username: e.username,
      plan: e.plan,
      payment: e.payment,
      amount: e.amount,
      createdAt: e.createdAt
    }));

  return {
    totals: {
      users: userCount,
      signups: count('signup'),
      logins: count('login'),
      failedLogins: count('login_failed'),
      planSelections: count('plan_selected'),
      estimatedRevenue
    },
    planCounts,
    paymentCounts,
    signupsByDay,
    recent
  };
}

module.exports = { computeStats };
