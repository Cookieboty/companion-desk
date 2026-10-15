/**
 * 看板娘事件台词（原创中文，可爱简短）。多条随机；冷却由 MascotCueService 控制。
 * MIT with the project.
 */

export type CueEvent =
  | 'hover:face'
  | 'hover:skirt'
  | 'hover:hands'
  | 'wall'
  | 'release'
  | 'wave'
  | 'think'
  | 'happy'
  | 'angry'
  | 'greet'
  | 'sleep'
  | 'agent:done'
  | 'agent:fail'
  | 'agent:permission'
  | 'agent:running'
  | 'agent:stalled'
  | 'agent:waiting'
  | 'reminder'
  | 'focus'
  | 'pomodoro'
  | 'file:drop'
  | 'confirm'
  | 'celebrate'
  | 'sorry'
  | 'thumbs_up'
  | 'goodnight'
  | 'nod'
  | 'clap'
  | 'poke'
  | 'grab_extra';

export const CUE_LINES: Record<CueEvent, string[]> = {
  'hover:face': ['嗯？看我干嘛～', '脸上有饭粒吗？', '靠太近会害羞的…'],
  'hover:skirt': ['喂！眼睛往哪儿看！', '哼，再看就不理你了。'],
  'hover:hands': ['要击掌吗？', '手手空空的～'],
  wall: ['哎呀撞到了…', '墙好硬…', '小心轻放哦。'],
  release: ['落地！', '呼…总算放下了。', '下次温柔一点嘛。'],
  wave: ['你好呀～', '嗨嗨！', '看见你啦！'],
  think: ['让我想想…', '嗯…稍等一下。', '思考中～'],
  happy: ['嘿嘿，好开心！', '耶～', '心情美美的！'],
  angry: ['哼！生气了！', '再这样可不行哦。', '真的要生气啦！'],
  greet: ['我来啦～', '今天也一起加油吧！', '你好，我是 Nomi～'],
  sleep: ['困困的…晚安。', '眯一会儿…呼…', '早点休息哦。'],
  'agent:done': ['任务搞定啦！', '完成～给你点个赞！', '这一轮做完了哦。'],
  'agent:fail': ['哎呀，出错了…', '这次没成功，再试试？', '失败了，别灰心。'],
  'agent:permission': ['需要你点一下确认～', '权限在等你哦。', '请到对话里允许或拒绝。'],
  'agent:running': ['我在干活呢～', '编程进行中…', '专心敲代码中！'],
  'agent:stalled': ['好像卡住了…', '半天没动静呢。', '要不要去看看？'],
  'agent:waiting': ['在等你回复哦～', '轮到你啦！', '我准备好了，等你指示。'],
  reminder: ['提醒时间到！', '叮咚，记得这件事哦。', '到点啦～'],
  focus: ['专注时间开始！', '进入心流模式～', '加油，我陪你。'],
  pomodoro: ['番茄钟响啦！休息一下吧。', '嘀嘀，该歇会儿了。', '站起来走走～'],
  'file:drop': ['收到文件啦！', '我看看是什么～', '拖给我的，我来读。'],
  confirm: ['这个操作要你确认一下。', '请确认后再继续哦。', '我等你点头～'],
  celebrate: ['太棒了！！', '庆祝一下～', '成功啦，撒花！'],
  sorry: ['抱歉抱歉…', '对不起嘛…', '我这就更正。'],
  thumbs_up: ['赞！', '干得漂亮！', '给你竖大拇指～'],
  goodnight: ['晚安～好梦。', '夜深了，歇歇吧。', '明天见。'],
  nod: ['嗯嗯。', '好的～', '收到！'],
  clap: ['啪啪啪！', '鼓掌～', '耶！'],
  poke: ['好痒！', '别戳啦～', '呀！'],
  grab_extra: ['抱稳我哦！', '要飞咯～', '放我下来啦！'],
};

/** 事件默认冷却（ms）与语音优先级（高可打断低） */
export const CUE_META: Record<CueEvent, { cooldownMs: number; priority: number; sfx?: string }> = {
  'hover:face': { cooldownMs: 8000, priority: 1, sfx: 'hum' },
  'hover:skirt': { cooldownMs: 8000, priority: 1, sfx: 'hum' },
  'hover:hands': { cooldownMs: 8000, priority: 1, sfx: 'pop' },
  wall: { cooldownMs: 4000, priority: 2, sfx: 'land' },
  release: { cooldownMs: 2500, priority: 2, sfx: 'pop' },
  wave: { cooldownMs: 5000, priority: 2, sfx: 'wave' },
  think: { cooldownMs: 6000, priority: 2, sfx: 'think' },
  happy: { cooldownMs: 5000, priority: 2, sfx: 'ding' },
  angry: { cooldownMs: 5000, priority: 2, sfx: 'hum' },
  greet: { cooldownMs: 30_000, priority: 2, sfx: 'wave' },
  sleep: { cooldownMs: 60_000, priority: 1, sfx: 'hum' },
  'agent:done': { cooldownMs: 8000, priority: 4, sfx: 'success' },
  'agent:fail': { cooldownMs: 8000, priority: 4, sfx: 'fail' },
  'agent:permission': { cooldownMs: 5000, priority: 5, sfx: 'ding' },
  'agent:running': { cooldownMs: 45_000, priority: 2, sfx: 'think' },
  'agent:stalled': { cooldownMs: 60_000, priority: 3, sfx: 'hum' },
  'agent:waiting': { cooldownMs: 30_000, priority: 3, sfx: 'ding' },
  reminder: { cooldownMs: 2000, priority: 5, sfx: 'ding' },
  focus: { cooldownMs: 30_000, priority: 3, sfx: 'ding' },
  pomodoro: { cooldownMs: 10_000, priority: 4, sfx: 'ding' },
  'file:drop': { cooldownMs: 3000, priority: 3, sfx: 'swoosh' },
  confirm: { cooldownMs: 4000, priority: 4, sfx: 'think' },
  celebrate: { cooldownMs: 5000, priority: 3, sfx: 'success' },
  sorry: { cooldownMs: 5000, priority: 3, sfx: 'fail' },
  thumbs_up: { cooldownMs: 5000, priority: 3, sfx: 'pop' },
  goodnight: { cooldownMs: 60_000, priority: 2, sfx: 'hum' },
  nod: { cooldownMs: 4000, priority: 1, sfx: 'click' },
  clap: { cooldownMs: 4000, priority: 2, sfx: 'pop' },
  poke: { cooldownMs: 2000, priority: 2, sfx: 'pop' },
  grab_extra: { cooldownMs: 3000, priority: 2, sfx: 'swoosh' },
};

/** Reaction kinds already spoken in reactions.ts — bridge plays SFX only. */
export const REACTION_SPEAK_KINDS = new Set(['click', 'double', 'pat', 'land', 'grab']);
