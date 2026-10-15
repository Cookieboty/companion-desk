// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';

import {
  getChatMode,
  setChatMode,
  getConversationListView,
  setConversationListView,
  getEndpointFilter,
  setEndpointFilter,
} from '../src/services/chatPrefs';

describe('chatPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to normal mode and all list view', () => {
    expect(getChatMode()).toBe('normal');
    expect(getConversationListView()).toBe('all');
    expect(getEndpointFilter()).toBe('nomi');
  });

  it('persists mode and list view', () => {
    setChatMode('dev');
    setConversationListView('by-endpoint');
    setEndpointFilter('codex');
    expect(getChatMode()).toBe('dev');
    expect(getConversationListView()).toBe('by-endpoint');
    expect(getEndpointFilter()).toBe('codex');
  });
});
