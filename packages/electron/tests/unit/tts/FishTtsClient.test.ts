/**
 * FishTtsClient unit tests — mock fetch, no GPU / real Fish server.
 */

jest.unmock('fs');
jest.unmock('path');

import { FishTtsClient, resolveFishBaseUrl } from '../../../src/tts/fish/FishTtsClient';

describe('FishTtsClient', () => {
  it('resolveFishBaseUrl defaults', () => {
    expect(resolveFishBaseUrl('fish-local')).toBe('http://127.0.0.1:8080');
    expect(resolveFishBaseUrl('fish-cloud')).toBe('https://api.fish.audio');
    expect(resolveFishBaseUrl('fish-local', 'http://192.168.1.5:8080/')).toBe(
      'http://192.168.1.5:8080',
    );
  });

  it('health returns ok on {status:ok}', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
      headers: { get: () => null },
    })) as unknown as typeof fetch;

    const client = new FishTtsClient({
      mode: 'local',
      baseUrl: 'http://127.0.0.1:8080',
      fetchImpl,
    });
    const h = await client.health(1000);
    expect(h.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/v1/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('synthesize posts JSON and returns audio buffer', async () => {
    const audio = Buffer.from([1, 2, 3, 4]);
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.text).toBe('你好');
      expect(body.reference_id).toBe('nomi');
      expect(body.format).toBe('mp3');
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength),
        headers: { get: (k: string) => (k === 'content-type' ? 'audio/mpeg' : null) },
      };
    }) as unknown as typeof fetch;

    const client = new FishTtsClient({
      mode: 'local',
      baseUrl: 'http://127.0.0.1:8080',
      fetchImpl,
    });
    const result = await client.synthesize({ text: '你好', referenceId: 'nomi', format: 'mp3' });
    expect(result.mimeType).toBe('audio/mpeg');
    expect(Buffer.from(result.audio).equals(audio)).toBe(true);
  });

  it('cloud synthesize requires apiKey and sends Bearer', async () => {
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer sk-test');
      expect(headers.model).toBe('s2.1-pro-free');
      const audio = Buffer.from('mp3');
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength),
        headers: { get: () => 'audio/mpeg' },
      };
    }) as unknown as typeof fetch;

    const noKey = new FishTtsClient({
      mode: 'cloud',
      baseUrl: 'https://api.fish.audio',
      fetchImpl,
    });
    await expect(noKey.synthesize({ text: 'hi' })).rejects.toThrow(/apiKey/);

    const client = new FishTtsClient({
      mode: 'cloud',
      baseUrl: 'https://api.fish.audio',
      apiKey: 'sk-test',
      fetchImpl,
    });
    await client.synthesize({ text: 'hi', cloudModel: 's2.1-pro-free' });
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('prefers inline reference_audio over reference_id', async () => {
    const audio = Buffer.from([9, 9]);
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.reference_audio).toBe('QQ==');
      expect(body.reference_text).toBe('你好呀');
      expect(body.reference_id).toBeUndefined();
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength),
        headers: { get: () => 'audio/mpeg' },
      };
    }) as unknown as typeof fetch;

    const client = new FishTtsClient({
      mode: 'local',
      baseUrl: 'http://127.0.0.1:8080',
      fetchImpl,
    });
    await client.synthesize({
      text: '测试',
      referenceId: 'nomi',
      referenceAudioBase64: 'QQ==',
      referenceText: '你好呀',
    });
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('health fails gracefully on network error', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const client = new FishTtsClient({
      mode: 'local',
      baseUrl: 'http://127.0.0.1:8080',
      fetchImpl,
    });
    const h = await client.health(500);
    expect(h.ok).toBe(false);
    expect(h.message).toMatch(/ECONNREFUSED/);
  });
});
