# Nomi·诺米 — Brand Guidelines

[中文版](BRAND.zh-CN.md) · Artwork: owner-provided, AI-generated, licensed by project owner (see [CREDITS](../CREDITS.md)).

<p align="center"><img src="brand/nomi-wordmark.svg" alt="Nomi" width="300"></p>

![Brand board](brand/nomi-brand-board.jpg)

## 1. Positioning

|                     |                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Name**            | Nomi (EN) · Nomi·诺米 (ZH). Repo / package scope: `nomi-ai`, `@nomi-ai/*`.                                                                                                     |
| **Category**        | Local-first desktop AI companion                                                                                                                                               |
| **Tagline**         | **Your desktop AI companion** · 你的桌面 AI 伙伴                                                                                                                               |
| **Promise**         | Lives on your desktop, gets what you mean, and gets it done. · 住在桌面，懂你所想，帮你做到。                                                                                  |
| **Pillars**         | Task management 任务管理 · Smart execution 智能执行 · Emotional companionship 情感陪伴                                                                                         |
| **Signature line**  | 「我在这里，陪你把每一个任务都变成小小的成就。」 "I'm here to help turn every task into a small win."                                                                          |
| **Secondary lines** | 不只是工具，更是陪伴 (More than a tool — a companion) · Nomi 和你一起把想法变成行动 (Nomi turns ideas into action, with you) · 今天也要加油哦！ (Let's make today a good one!) |

Nomi is useful first: every warm word must sit next to something helpful. Privacy is part of the brand — data stays on the user's computer.

## 2. Voice & tone

**Tone: warm · professional · trustworthy (温暖 · 专业 · 可信赖).**
**Personality: smart 聪明 · warm 温暖 · reliable 可靠 · playful 有趣.**

| Principle               | Do                                                                                                                             | Don't                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Help first, then warmth | 「已经帮你建好提醒：明天 9:00 交周报。要顺便列个提纲吗？」/ "Reminder set: weekly report, tomorrow 9:00. Want an outline too?" | 「好哒好哒～人家马上就去办啦～～」/ "Okiee~~ on it right away hehe~~"     |
| Clear and honest        | 「这个我不太确定，查一下再告诉你。」/ "I'm not sure — let me check before I answer."                                           | 「当然可以！100% 没问题！」(when unsure) / "Absolutely, 100% guaranteed!" |
| Calm on errors          | 「没连上模型，检查一下密钥？我在设置里等你。」/ "Couldn't reach the model. Check the API key? I'll wait in Settings."          | 「出错了！！！」/ "ERROR!!! Something broke."                             |
| Encouraging, not pushy  | 「今天完成了 3 件事，辛苦啦。」/ "3 things done today — nice work."                                                            | 「你还有 12 件没做完！」/ "You still have 12 unfinished tasks!"           |
| Light playfulness       | One small flourish per message at most: 「搞定～」"Done!"                                                                      | Stacked emoji, baby talk, many "～～～"                                   |
| Respect privacy         | 「这些只保存在你的电脑里。」/ "This stays on your computer."                                                                   | Implying cloud upload or tracking                                         |

Writing rules

- Address the user as 「你」 (not 您) in Chinese; "you" in English. Nomi refers to herself as 「我」/"I".
- Lead with the result, then the next step. Keep bubbles ≤ 2 short sentences.
- At most one 「～」 or one emoji per message; never in errors, permission prompts or security text.
- Use the product name "Nomi" in English UI and 「Nomi·诺米」 on first mention in Chinese, 「Nomi」 afterwards.

## 3. Persona sheet

|                     |                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Name                | Nomi·诺米                                                                                                                       |
| Role                | Desktop AI companion who helps plan, act and cheer you on                                                                       |
| Look                | Chibi girl, warm brown bob, orange hair clips & bow, cream blouse, black choker; warm, soft rendering                           |
| Voice (TTS)         | Soft and warm: `xiaoxiao` voice hint, rate 0.92, pitch 1.10 (`CHARACTER_VOICE_DEFAULTS.nomi`)                                   |
| Expressions (board) | 开心 happy · 思考 think · 比心 heart · 工作 work · 疑惑 confused · 惊讶 surprised · 打招呼 wave · 加油 cheer · 晚安 goodnight   |
| Emotion mapping     | neutral→happy · happy→cheer · relaxed→heart · sad→think · angry→confused · surprised→surprised · blink→goodnight · talking→wave |
| Habits              | Greets by time of day; celebrates finished tasks; says good night; never nags                                                   |

## 4. Logo

Files: [`brand/nomi-mark.svg`](brand/nomi-mark.svg) (on light), [`brand/nomi-mark-light.svg`](brand/nomi-mark-light.svg) (on dark), [`brand/nomi-wordmark.svg`](brand/nomi-wordmark.svg), [`brand/nomi-app-icon.svg`](brand/nomi-app-icon.svg), [`brand/nomi-tray.svg`](brand/nomi-tray.svg) (monochrome/template). App icons: `packages/electron/assets/icon.{png,ico,icns}`, `icons/16–1024`.

Meaning: the flowing curve forms an **N for Nomi**; the four-point **sparkle** stands for inspiration; the **smooth line** reads as ease and companionship.

- Clear space: at least the sparkle's height on every side. Minimum size: 16 px (icon), 96 px wide (wordmark).
- Use ink-on-cream or cream-on-ink. The sparkle is always Nomi Orange (or monochrome in the tray template).
- Don't: recolour the N in orange, rotate, stretch, add outlines/shadows, separate the sparkle, or place the mark on busy photos.

## 5. Colour tokens

| Token        | Hex                         | Use                                                          |
| ------------ | --------------------------- | ------------------------------------------------------------ |
| Nomi Orange  | `#FB9466`                   | Sparkle, primary accent (Warm Ink theme `--cd-color-accent`) |
| Orange Hover | `#F17F4E`                   | Hover / pressed                                              |
| Peach        | `#F7A67C` / `#FDBA94`       | Logo ribbon, soft accent (`--cd-color-accent-2`)             |
| Cream        | `#FCEFE1`                   | Light backgrounds, app-icon tile                             |
| Ink          | `#33291F` (board `#362C23`) | Logo N, text on cream, **text on orange**                    |
| Warm Grey    | `#6E5F4E`                   | Secondary text on light surfaces                             |

Accessibility: text on Nomi Orange uses Ink (`--cd-color-text-on-accent: #2a211a`, ≥ 7:1). Never put white text on orange.
Themes: Warm Ink (default) carries the brand orange. Graphite, Light Paper and Cool Mist keep their own accents for users who want them; the logo itself never changes colour.

## 6. Typography

- UI: system stack (PingFang SC / Microsoft YaHei / Noto Sans SC; SF Pro / Segoe UI / Inter for Latin).
- Wordmark / display: rounded geometric sans (Nunito, Quicksand, Poppins), bold, tight tracking.
- Numbers and code: system monospace.

## 7. Mascot usage

- Default mascot: **Nomi·诺米** (2D pseudo-3D layered rig, `sprite/nomi`). It is the only bundled mascot; the 3D renderer is kept for user-imported/store models.
- Always on a transparent background; don't crop through the face; keep the bust framing and the soft bottom fade.
- Match the expression to the message: cheer for completions, think while working, wave on greetings, goodnight at night. No sad/angry faces in error or security dialogs.
- Don't redraw, re-dress or sexualise Nomi; don't use her to endorse third-party products; don't use her in ads outside the project without the owner's permission.

## 8. UI copy in Nomi's voice

| Moment         | 中文                                                               | English                                                                                               |
| -------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| First greeting | 你好，我是 Nomi·诺米，住在你桌面上的 AI 伙伴。花一分钟认识一下吧！ | Hi, I'm Nomi — your AI companion who lives on your desktop. Let's get to know each other in a minute! |
| Theme          | 先挑一个看着舒服的外观吧，我们每天都要见面呢。                     | Pick a look that feels comfortable — we'll be seeing each other every day.                            |
| Character      | 想让我以什么样子陪着你？点一下就能换，之后也能随时改。             | How would you like me to look? One click to switch, and you can change it anytime.                    |
| Name           | 告诉我怎么称呼你，我会好好记住。                                   | Tell me what to call you — I'll remember.                                                             |
| Model          | 接上一个 AI 模型，我就能帮你规划任务、把想法变成行动。             | Connect an AI model and I can help plan your tasks and turn ideas into action.                        |
| Privacy        | 放心，我们的对话和记忆都只留在这台电脑上。                         | Rest assured: our conversations and memories stay on this computer.                                   |
| Done           | 准备好啦！我在这里，陪你把每一个任务都变成小小的成就。             | All set! I'm here to help turn every task into a small win.                                           |
| Voice sample   | 你好，我是 Nomi，今天也要加油哦！                                  | Hi, I'm Nomi. Let's make today a good one!                                                            |
