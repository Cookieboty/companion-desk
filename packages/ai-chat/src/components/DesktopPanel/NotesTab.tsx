import { Badge, Button, EmptyState, Input, Textarea } from '@ig-live/ui';
import React, { useCallback, useEffect, useState } from 'react';

import { desktopClient, type NoteMetaView, type NoteView } from '../../services/desktopClient';

import styles from './index.module.css';

/** 笔记：本地 markdown 笔记库（userData/desktop/notes）。搜索 / 新建 / 编辑 / 删除（进回收站，可撤销）。 */
export const NotesTab: React.FC<{ onMsg: (m: string) => void }> = ({ onMsg }) => {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Array<NoteMetaView & { snippet?: string }>>([]);
  const [edit, setEdit] = useState<Partial<NoteView> | null>(null);

  const load = useCallback(async () => setItems(await desktopClient.notes(query)), [query]);
  useEffect(() => {
    void load();
    return desktopClient.onP2Changed((k) => k === 'notes' && void load());
  }, [load]);

  const open = async (id: string) => setEdit(await desktopClient.readNote(id));
  const save = async () => {
    if (!edit) return;
    const n = await desktopClient.saveNote({
      id: edit.id,
      title: edit.title ?? '',
      body: edit.body ?? '',
      tags: (edit.tags ?? []).filter(Boolean),
    });
    onMsg(`已保存「${n.title}」`);
    setEdit(null);
    void load();
  };
  const trash = async (id: string, title: string) => {
    if (await desktopClient.trashNote(id))
      onMsg(`已移到回收站：「${title}」（可在操作记录里撤销）`);
    setEdit(null);
    void load();
  };

  if (edit)
    return (
      <div className={styles.stack} data-testid="note-editor">
        <Input
          placeholder="标题"
          value={edit.title ?? ''}
          onChange={(e) => setEdit({ ...edit, title: e.target.value })}
          data-testid="note-title"
        />
        <Input
          placeholder="标签（用逗号分隔）"
          value={(edit.tags ?? []).join(', ')}
          onChange={(e) =>
            setEdit({ ...edit, tags: e.target.value.split(/[,，]/).map((t) => t.trim()) })
          }
          data-testid="note-tags"
        />
        <Textarea
          rows={10}
          placeholder="正文（markdown）"
          value={edit.body ?? ''}
          onChange={(e) => setEdit({ ...edit, body: e.target.value })}
          data-testid="note-body"
        />
        <div className={styles.row}>
          <Button variant="primary" onClick={() => void save()} data-testid="note-save">
            保存
          </Button>
          <Button onClick={() => setEdit(null)}>取消</Button>
          {edit.id && (
            <Button variant="danger" onClick={() => void trash(edit.id!, edit.title ?? '')}>
              删除
            </Button>
          )}
        </div>
      </div>
    );

  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <Input
          placeholder="搜索标题 / 标签 / 正文"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="notes-search"
          style={{ flex: 1 }}
        />
        <Button
          variant="primary"
          onClick={() => setEdit({ title: '', body: '', tags: [] })}
          data-testid="note-new"
        >
          新建笔记
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          title={query ? '没有匹配的笔记' : '还没有笔记'}
          description="可以让看板娘帮你记：「帮我记一下……」"
        />
      ) : (
        <ul className={styles.cards} data-testid="notes-list">
          {items.map((n) => (
            <li key={n.id} className={styles.cardItem}>
              <button type="button" className={styles.cardBtn} onClick={() => void open(n.id)}>
                <strong>{n.title}</strong>
                <span className={styles.hint}>{new Date(n.updated).toLocaleString()}</span>
                {n.snippet && <span className={styles.snippet}>{n.snippet}</span>}
              </button>
              <span className={styles.row}>
                {n.tags.map((t) => (
                  <Badge key={t}>#{t}</Badge>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
