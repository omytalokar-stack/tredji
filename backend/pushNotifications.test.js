import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPushNotifications } from './pushNotifications.js';

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-device',
  expirationTime: null,
  keys: {
    p256dh: 'A'.repeat(87),
    auth: 'B'.repeat(22),
  },
};

function makePush(sendNotification = async () => {}) {
  return {
    vapidDetails: null,
    setVapidDetails(subject, publicKey, privateKey) {
      this.vapidDetails = { subject, publicKey, privateKey };
    },
    sendNotification,
  };
}

async function withTemporaryStorage(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'trapdetector-push-'));
  try {
    await run(path.join(directory, 'subscriptions.json'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const configured = (storagePath, push) => createPushNotifications({
  publicKey: 'public-key',
  privateKey: 'private-key',
  subject: 'mailto:alerts@example.com',
  storagePath,
  push,
});

test('subscription storage creates missing nested directories during startup', async () => {
  await withTemporaryStorage(async (storagePath) => {
    const nestedStoragePath = path.join(path.dirname(storagePath), 'nested', 'push', 'subscriptions.json');
    const service = await configured(nestedStoragePath, makePush());
    assert.equal(service.getSubscriptionCount(), 0);
    assert.equal((await stat(path.dirname(nestedStoragePath))).isDirectory(), true);
  });
});

test('push subscriptions are validated, upserted and persisted across restarts', async () => {
  await withTemporaryStorage(async (storagePath) => {
    const push = makePush();
    const service = await configured(storagePath, push);
    assert.equal(service.enabled, true);
    assert.equal(push.vapidDetails.subject, 'mailto:alerts@example.com');

    await service.addSubscription(subscription);
    await service.addSubscription(subscription);
    assert.equal(service.getSubscriptionCount(), 1);

    const restartedService = await configured(storagePath, makePush());
    assert.equal(restartedService.getSubscriptionCount(), 1);
    await restartedService.removeSubscription(subscription.endpoint);
    assert.equal(JSON.parse(await readFile(storagePath, 'utf8')).length, 0);
  });
});

test('subscription validation rejects unsafe endpoints and malformed keys', async () => {
  await withTemporaryStorage(async (storagePath) => {
    const service = await configured(storagePath, makePush());
    await assert.rejects(
      service.addSubscription({ ...subscription, endpoint: 'https://127.0.0.1/internal' }),
      /valid HTTPS push subscription/
    );
    await assert.rejects(
      service.addSubscription({ ...subscription, keys: { ...subscription.keys, auth: 'short' } }),
      /valid HTTPS push subscription/
    );
  });
});

test('critical signals are delivered and expired subscriptions are removed', async () => {
  await withTemporaryStorage(async (storagePath) => {
    const deliveries = [];
    const push = makePush(async (target, payload, options) => {
      deliveries.push({ target, payload: JSON.parse(payload), options });
      const error = new Error('Subscription expired');
      error.statusCode = 410;
      throw error;
    });
    const service = await configured(storagePath, push);
    await service.addSubscription(subscription);

    await service.notifySignal({
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      severity: 'NEUTRAL',
      signalType: 'NEUTRAL_SCANNING',
    });
    assert.equal(deliveries.length, 0);

    await service.notifySignal({
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      severity: 'CRITICAL',
      signalType: 'RETAIL_TRAP_BHEED',
      headline: 'Critical trap',
      actionAdvice: 'Do not chase.',
    });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].target.endpoint, subscription.endpoint);
    assert.equal(deliveries[0].payload.tag, 'trapdetector-BTCUSDT-RETAIL_TRAP_BHEED');
    assert.equal(deliveries[0].options.TTL, 60);
    assert.equal(service.getSubscriptionCount(), 0);
  });
});

test('critical, opportunity and warning signals all send push notifications', async () => {
  await withTemporaryStorage(async (storagePath) => {
    const deliveries = [];
    const push = makePush(async (_subscription, payload) => {
      deliveries.push(JSON.parse(payload));
    });
    const service = await configured(storagePath, push);
    await service.addSubscription(subscription);

    for (const [severity, signalType] of [
      ['CRITICAL', 'RETAIL_TRAP_BHEED'],
      ['OPPORTUNITY', 'STOP_LOSS_HUNT_ENTRY'],
      ['WARNING', 'FAKE_BREAKOUT'],
      ['NEUTRAL', 'NEUTRAL_SCANNING'],
    ]) {
      await service.notifySignal({
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        severity,
        signalType,
        headline: 'Signal headline',
        actionAdvice: 'Signal advice',
      });
    }

    assert.equal(deliveries.length, 3);
    assert.deepEqual(deliveries.map(({ title }) => title), [
      'BTC: CRITICAL MTF signal',
      'BTC: OPPORTUNITY MTF signal',
      'BTC: WARNING MTF signal',
    ]);
  });
});

test('VAPID keys must be configured as a pair', async () => {
  await assert.rejects(
    createPushNotifications({ publicKey: 'public-key', privateKey: '', subject: 'mailto:alerts@example.com' }),
    /Set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY/
  );
});
