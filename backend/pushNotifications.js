import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import webPush from 'web-push';

const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'fcmregistrations.googleapis.com',
  'push.services.mozilla.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com',
];
const DEFAULT_VAPID_SUBJECT = 'https://trapdetector-ai.vercel.app';

function isAllowedPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;

  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' &&
      ALLOWED_PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export function normalizePushSubscription(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { endpoint, expirationTime, keys } = value;
  if (
    !isAllowedPushEndpoint(endpoint) ||
    !keys ||
    typeof keys !== 'object' ||
    typeof keys.p256dh !== 'string' ||
    !/^[A-Za-z0-9_-]{80,100}$/.test(keys.p256dh) ||
    typeof keys.auth !== 'string' ||
    !/^[A-Za-z0-9_-]{20,30}$/.test(keys.auth) ||
    (expirationTime !== null && expirationTime !== undefined &&
      (typeof expirationTime !== 'number' || !Number.isFinite(expirationTime)))
  ) {
    return null;
  }

  return {
    endpoint,
    expirationTime: expirationTime ?? null,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

function readStoredSubscriptions(contents) {
  let data;
  try {
    data = JSON.parse(contents);
  } catch (error) {
    throw new Error('Push subscription storage contains invalid JSON.', { cause: error });
  }
  if (!Array.isArray(data)) {
    throw new Error('Push subscription storage must contain a JSON array.');
  }

  const subscriptions = new Map();
  for (const value of data) {
    const subscription = normalizePushSubscription(value);
    if (!subscription) {
      throw new Error('Push subscription storage contains an invalid subscription.');
    }
    subscriptions.set(subscription.endpoint, subscription);
  }
  return subscriptions;
}

export async function createPushNotifications({
  publicKey = process.env.VAPID_PUBLIC_KEY?.trim(),
  privateKey = process.env.VAPID_PRIVATE_KEY?.trim(),
  subject = process.env.VAPID_SUBJECT?.trim(),
  storagePath = path.resolve(process.env.PUSH_SUBSCRIPTIONS_FILE || 'data/push-subscriptions.json'),
  push = webPush,
} = {}) {
  let enabled = Boolean(publicKey && privateKey);
  let configurationError = null;
  if (Boolean(publicKey) !== Boolean(privateKey)) {
    enabled = false;
    configurationError = 'Set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable Web Push.';
  }
  if (enabled) {
    try {
      push.setVapidDetails(subject?.trim() || DEFAULT_VAPID_SUBJECT, publicKey, privateKey);
    } catch (error) {
      enabled = false;
      configurationError = `The configured VAPID keys are invalid: ${error.message} Generate a valid VAPID key pair and update both backend environment variables.`;
    }
  }

  await mkdir(path.dirname(storagePath), { recursive: true });
  let subscriptions = new Map();
  try {
    subscriptions = readStoredSubscriptions(await readFile(storagePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  let mutationQueue = Promise.resolve();
  const persist = async (nextSubscriptions) => {
    const directory = path.dirname(storagePath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${storagePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify([...nextSubscriptions.values()]), { mode: 0o600 });
      await rename(temporaryPath, storagePath);
    } catch (error) {
      try {
        await unlink(temporaryPath);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          console.warn('Unable to remove temporary push subscription storage file:', cleanupError);
        }
      }
      throw error;
    }
  };
  const mutateSubscriptions = (mutate) => {
    const operation = mutationQueue.then(async () => {
      const nextSubscriptions = new Map(subscriptions);
      mutate(nextSubscriptions);
      await persist(nextSubscriptions);
      subscriptions = nextSubscriptions;
    });
    mutationQueue = operation.catch(() => {});
    return operation;
  };

  async function addSubscription(value) {
    const subscription = normalizePushSubscription(value);
    if (!subscription) throw new TypeError('A valid HTTPS push subscription is required.');
    await mutateSubscriptions((nextSubscriptions) => {
      nextSubscriptions.set(subscription.endpoint, subscription);
    });
  }

  async function removeSubscription(endpoint) {
    if (!isAllowedPushEndpoint(endpoint)) throw new TypeError('A valid push subscription endpoint is required.');
    await mutateSubscriptions((nextSubscriptions) => {
      nextSubscriptions.delete(endpoint);
    });
  }

  async function notifySignal(analysis) {
    if (
      !enabled ||
      !['CRITICAL', 'OPPORTUNITY', 'WARNING'].includes(analysis.severity) ||
      subscriptions.size === 0
    ) {
      return;
    }
    const tag = `trapdetector-${analysis.symbol}-${analysis.signalType}`;
    const payload = JSON.stringify({
      title: `${analysis.baseAsset}: ${analysis.severity} MTF signal`,
      body: `${analysis.headline} ${analysis.actionAdvice}`,
      tag,
      url: '/',
    });

    await Promise.all([...subscriptions.values()].map(async (subscription) => {
      try {
        await push.sendNotification(subscription, payload, { TTL: 60 });
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await removeSubscription(subscription.endpoint);
          console.info(`Removed expired push subscription for ${analysis.symbol}.`);
          return;
        }
        console.error(`Push delivery failed for ${analysis.symbol}:`, error.message);
      }
    }));
  }

  return {
    enabled,
    publicKey: enabled ? publicKey : null,
    configurationError,
    addSubscription,
    removeSubscription,
    notifySignal,
    getSubscriptionCount: () => subscriptions.size,
  };
}
