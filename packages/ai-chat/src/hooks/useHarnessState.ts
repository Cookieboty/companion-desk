/**
 * 订阅主进程的 harness 状态（主标签后端、cwd、各 CLI 是否已安装）。
 */
import { useEffect, useState } from 'react';

import { harnessClient, type HarnessState } from '../services/harnessClient';

export function useHarnessState(): HarnessState | null {
  const available = harnessClient.available();
  const [state, setState] = useState<HarnessState | null>(null);
  useEffect(() => {
    if (!available) return;
    let alive = true;
    void harnessClient
      .state()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState(null));
    const off = harnessClient.onChanged(setState);
    return () => {
      alive = false;
      off();
    };
  }, [available]);
  return state;
}
