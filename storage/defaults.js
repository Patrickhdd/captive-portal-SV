'use strict';

// Default plan catalogue, seeded into the database on first run. After that,
// plans are editable from the in-app admin panel, so these are only the
// starting values.
const DEFAULT_PLANS = [
  {
    id: 'free',
    name: 'Free WiFi',
    type: 'free',
    speed: 'Best effort',
    amount: 0,
    description: 'Complimentary internet access for all guests.',
    sortOrder: 1,
    active: 1
  },
  {
    id: 'fiber-50',
    name: 'Fiber Optic 50 Mbps',
    type: 'fiber',
    speed: '50 Mbps',
    amount: 5,
    description: 'Dedicated fiber line at 50 Mbps. Great for streaming and video calls.',
    sortOrder: 2,
    active: 1
  },
  {
    id: 'fiber-70',
    name: 'Fiber Optic 70 Mbps',
    type: 'fiber',
    speed: '70 Mbps',
    amount: 8,
    description: 'Dedicated fiber line at 70 Mbps. Ideal for heavy use and multiple devices.',
    sortOrder: 3,
    active: 1
  },
  {
    id: 'fiber-open',
    name: 'Fiber Optic Open Speed',
    type: 'fiber',
    speed: 'Unlimited / Open',
    amount: 12,
    description: 'Uncapped fiber connection with maximum available speed.',
    sortOrder: 4,
    active: 1
  }
];

const PAYMENT_METHODS = [
  { id: 'wish', name: 'Wish Money Lebanon' },
  { id: 'cash', name: 'Cash at Reception' }
];

module.exports = { DEFAULT_PLANS, PAYMENT_METHODS };
