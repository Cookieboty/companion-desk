# Mascot desktop interaction

The mascot window is a transparent, frameless, always-on-top Electron window (420×450). This page covers how she reacts to the mouse, how she gets dragged around and how she moves on the desktop. Everything below can be switched off in **Tray → 互动设置** or **Character picker → 互动设置**. The settings live in `localStorage` (`mascot.interaction.v1`) and are pushed to the main process.

| Toggle                            | Default | What it does                                                                              |
| --------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| 透明区域点击穿透 (`clickThrough`) | on      | Clicks on transparent pixels go to the window underneath.                                 |
| 重力与落地 (`gravity`)            | on      | When you let go she falls onto the taskbar/Dock edge, bounces, and hits the walls.        |
| 偶尔散步 (`wander`)               | **off** | Every 20–60 s she walks a short distance along the bottom edge.                           |
| 触摸反应 (`reactions`)            | on      | Expression, motion and a line of dialogue for hover, head pats, clicks and double-clicks. |
| 视线跟随全局鼠标 (`globalLook`)   | on      | Her eyes and head follow the cursor even when it is outside the window.                   |

## Architecture

```
main process                                   renderer (R3F canvas)
MascotWindowController (60 Hz)                 MascotInteractionLayer
  ├─ screen.getCursorScreenPoint ──cursor 30Hz──▶ hit test (alpha 5×5 + bone colliders + DOM UI)
  ├─ setIgnoreMouseEvents / setShape ◀──hit/shape─┤ region pick (ray vs bone spheres)
  ├─ drag: pointer screen coords ◀──drag-start/move/end── pointer capture on the canvas
  ├─ desktopPhysics (fixed 1/120 s step) ◀──geometry (character box in window px)
  └─ body {mode,v,a} + physics events ──────────▶ VrmBackend: dangle pose, spring inertia,
                                                  squash on landing, walk facing, look-at
```

- `packages/electron/src/mascot/desktopPhysics.ts` contains pure math: floor and walls taken from `screen.getAllDisplays()[].workArea`, gravity, restitution, friction, walking, throw velocity (`VelocityTracker`), and fixed-step `advance()`.
- `packages/electron/src/mascot/MascotWindowController.ts` handles the window side: cursor polling, click-through, dragging, physics ticks, display hot-plug, and pausing while the window is hidden or minimised.
- `packages/renderer/src/mascot/interaction/` holds the rest:
  - `regions.ts`: bone spheres (face, head, body, hands, skirt, legs) and ray picking.
  - `gestures.ts`: head-pat detection, single vs. double click, and the reaction table. All dialogue lines are original (MIT).
  - `springs.ts`: damped springs, squash curve, neck limits, and the mapping from window acceleration to spring-bone gravity.
  - `shape.ts`: alpha scanlines turned into window-shape rects (used on Linux).
  - `MascotInteractionLayer.tsx`: wires the pieces above together.
- `packages/renderer/src/mascot/backends/vrm.ts` adds several layers on top of the motion mixer:
  - a "held/airborne" pose (arms up, legs kicking, leaning against the motion);
  - head and neck look-at, using a critically damped spring and yaw ±0.6 / pitch +0.35 −0.30 rad limits;
  - squash-and-settle on landing;
  - sideways facing while walking;
  - spring-bone inertia: each joint's `gravityDir`/`gravityPower` gets an inertial term from the window acceleration. The term is low-passed and capped at 2.5 so the bones stay stable during violent drags.
- `vrm.update()` runs in ≤1/60 s sub-steps, so spring bones also stay stable after a dropped frame. Rendering stops (`frameloop="never"`) while the document is hidden.
- New motion clips (CC0, Quaternius UAL): `walk` (in-place Walk_Loop, used as the base loop while wandering) and `poke` (Hit_Chest).

## Reactions

| Region | Hover                                            | Click                           | Double-click       |
| ------ | ------------------------------------------------ | ------------------------------- | ------------------ |
| head   | (rub back and forth = **head pat**: happy + nod) | relaxed + nod                   | happy + jump       |
| face   | surprised                                        | surprised + flinch ("别戳脸！") | happy + jump       |
| body   | –                                                | surprised + poke                | happy + jump       |
| hands  | happy + wave                                     | happy + wave                    | happy + jump       |
| skirt  | **angry + shake head (protest)**                 | angry + shake ("变态！")        | angry, held longer |
| legs   | –                                                | sad + flinch                    | happy + jump       |

There are also reactions for being grabbed, landing hard (> 900 px/s) and hitting a wall. Hover reactions have per-region cooldowns, so moving the mouse around does not spam them. Lines show up in the speech bubble. Click-type reactions are also read aloud with the Web Speech API when a system voice is available.

## Platform notes and limits

|                      | Windows                                                                                                                                                                   | macOS                                                 | Linux (X11)                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Click-through        | `setIgnoreMouseEvents(true, {forward:true})`, toggled by a per-pixel hit test of the cursor (polled from the main process).                                               | Same as Windows.                                      | **Window shape** (`win.setShape`): alpha scanlines of the character plus the toolbar/bubble rects, refreshed at about 4 Hz; the full window while a dialog is open. On X11 `forward` is not supported, and `getCursorScreenPoint()` only updates while the cursor is over one of the app's windows, so cursor polling cannot detect the cursor coming back. |
| Global look-at       | Yes                                                                                                                                                                       | Yes                                                   | Only while the cursor is over the window. Outside it the last known position is kept (X11 limitation, see above).                                                                                                                                                                                                                                           |
| Floor / walls        | `workArea`, so she stands on the taskbar                                                                                                                                  | `workArea`, so she stands on the Dock / menu bar edge | `workArea` (depends on the WM reporting struts)                                                                                                                                                                                                                                                                                                             |
| Multi-monitor        | Floor is taken from the display under her centre. Walls are the outermost edges. Walking onto a display with a lower floor makes her fall onto it.                        | Same                                                  | Same                                                                                                                                                                                                                                                                                                                                                        |
| Sit on other windows | Not implemented. Electron has no API to list other apps' window rects; it would need a native module (`EnumWindows` / `CGWindowListCopyWindowInfo`). Left as a follow-up. | Not implemented (same reason).                        | Skipped.                                                                                                                                                                                                                                                                                                                                                    |
| Wayland              | –                                                                                                                                                                         | –                                                     | Absolute window positioning is not allowed on Wayland, so dragging, gravity and wander have no effect. Run under XWayland (`--ozone-platform=x11`) to get them.                                                                                                                                                                                             |

Other limits:

- Hit testing reads one 5×5 pixel block of the previous frame, which requires `preserveDrawingBuffer: true`. The Linux shape path also reads the whole canvas at about 4 Hz. On software GL this costs roughly 1 ms per read.
- The character box sent to the main process updates with 8 px hysteresis. Without it, idle sway would make the window jitter against the floor.
- Spring-bone inertia is an approximation (an extra gravity term), not true frame-of-reference physics.

## Tests

- Unit tests:
  - `packages/electron/tests/unit/mascot/desktopPhysics.test.ts`: floor and walls, multi-monitor, bounce and settle, walking, frame-rate-independent fixed step, throw velocity.
  - `packages/renderer/tests/mascot/interaction.test.ts`: region mapping and ray picking, head pat, click vs. double-click, reaction table, springs, neck limits, spring inertia, shape scanlines.
- E2E: `e2e-headed/tests/E9.interaction.headed.spec.ts` runs the real app with real X cursor events via `xdotool` under xvfb:
  - she settles on the work area;
  - clicks on the transparent corner pass through, and the character still receives events;
  - a hover over the head registers and a click triggers a reaction;
  - a drag lifts her (held pose), and when released she falls and lands;
  - the settings panel turns on wander and she walks;
  - turning click-through off resets the shape.

  Set `E9_SHOTS=<dir>` to save full-screen frames.
