import { backendApiUrl } from './backendApi';

async function responseError(response: Response, fallback: string): Promise<Error> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      return new Error(body.error);
    }
  } catch {
    // The server may return a non-JSON error response.
  }
  return new Error(`${fallback} (HTTP ${response.status}).`);
}

function decodeVapidKey(value: string): ArrayBuffer {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const decoded = window.atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  const key = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(key).set(bytes);
  return key;
}

export async function subscribeForPush(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription> {
  const keyResponse = await fetch(backendApiUrl('/api/push/public-key'), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!keyResponse.ok) throw await responseError(keyResponse, 'Unable to load the push server key');

  const keyBody: unknown = await keyResponse.json();
  if (
    typeof keyBody !== 'object' ||
    keyBody === null ||
    !('publicKey' in keyBody) ||
    typeof keyBody.publicKey !== 'string' ||
    !keyBody.publicKey
  ) {
    throw new Error('The push server returned an invalid public key.');
  }

  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription = existingSubscription ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidKey(keyBody.publicKey),
  });

  try {
    const response = await fetch(backendApiUrl('/api/push/subscribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!response.ok) throw await responseError(response, 'Unable to save this device subscription');
  } catch (error) {
    if (!existingSubscription) await subscription.unsubscribe();
    throw error;
  }

  return subscription;
}

export async function unsubscribeFromPush(
  registration: ServiceWorkerRegistration
): Promise<void> {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const response = await fetch(backendApiUrl('/api/push/subscribe'), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok) throw await responseError(response, 'Unable to remove this device subscription');
  const unsubscribed = await subscription.unsubscribe();
  if (!unsubscribed) throw new Error('The browser did not remove this device push subscription.');
}
