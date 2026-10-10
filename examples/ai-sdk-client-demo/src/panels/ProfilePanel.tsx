import { useUserProfile } from '@ig-live/ai-sdk-client/react';
import { useState } from 'react';

interface DemoProfile {
  id?: string;
  nickname?: string;
  language?: string;
}

export function ProfilePanel() {
  const { profile, loading, set, reset, error } = useUserProfile<DemoProfile>();
  const [nickname, setNickname] = useState('');

  return (
    <section className="card profile-form">
      <h2>useUserProfile · 读写 + 订阅</h2>
      {loading && <em>加载中…</em>}
      <pre>{profile ? JSON.stringify(profile, null, 2) : '<empty>'}</pre>
      <label>
        修改昵称
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={profile?.nickname ?? 'nya'}
        />
      </label>
      <div className="input-row">
        <button
          onClick={() => {
            const v = nickname.trim();
            if (!v) return;
            setNickname('');
            void set({ nickname: v });
          }}
        >
          set
        </button>
        <button className="secondary" onClick={() => void reset()}>
          reset
        </button>
      </div>
      {error && (
        <pre>
          {error.code}: {error.message}
        </pre>
      )}
    </section>
  );
}
