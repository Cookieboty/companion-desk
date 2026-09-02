'use strict';

/**
 * e2e-headed preload
 *
 * 1. 通过 mkAiPreload 暴露 `window.aiIPC`（走 `ai:` 白名单校验）；
 * 2. 挂 `window.__e2eProbe`：Playwright 从这里拿到事件采集器。
 */

const { contextBridge, ipcRenderer } = require('electron');
const { mkAiPreload } = require('@ig-live/ai-sdk-client/preload');

mkAiPreload({ contextBridge, ipcRenderer });

const buffer = {
  ttsChunks: [],
  turnEnds: [],
  toolExecuted: [],
  profileChanged: [],
  events: [],
};

const AI_EVENT_CHANNEL = 'ai:event';

ipcRenderer.on(AI_EVENT_CHANNEL, (_evt, payload) => {
  if (!payload || typeof payload !== 'object') return;
  const { evt, data } = payload;
  buffer.events.push({ evt, data });
  if (evt === 'tts:chunk') buffer.ttsChunks.push(data);
  else if (evt === 'agent:turn-end') buffer.turnEnds.push(data);
  else if (evt === 'tool:executed') buffer.toolExecuted.push(data);
  else if (evt === 'userProfile:changed') buffer.profileChanged.push(data);
});

contextBridge.exposeInMainWorld('__e2eProbe', {
  getEvents() {
    return JSON.parse(JSON.stringify(buffer.events));
  },
  getTtsChunks() {
    return JSON.parse(JSON.stringify(buffer.ttsChunks));
  },
  getTurnEnds() {
    return JSON.parse(JSON.stringify(buffer.turnEnds));
  },
  getToolExecuted() {
    return JSON.parse(JSON.stringify(buffer.toolExecuted));
  },
  getProfileChanged() {
    return JSON.parse(JSON.stringify(buffer.profileChanged));
  },
  clear() {
    buffer.ttsChunks.length = 0;
    buffer.turnEnds.length = 0;
    buffer.toolExecuted.length = 0;
    buffer.profileChanged.length = 0;
    buffer.events.length = 0;
  },
});
