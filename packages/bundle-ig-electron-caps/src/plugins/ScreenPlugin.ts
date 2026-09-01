import { definePlugin, type PluginContext } from '@ig-live/bundle-ig-base';

import { loadElectron } from '../electronLoader';
import {
  ScreenKey,
  type CaptureOptions,
  type CaptureResult,
  type DisplayInfo,
  type ScreenService,
} from '../seams/screen';

export interface ScreenPluginConfig {
  /** desktopCapturer 缩略图最大宽/高（不设时按物理像素） */
  thumbnailMaxWidth?: number;
  thumbnailMaxHeight?: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ElectronDisplay {
  id: number;
  label?: string;
  bounds: Rect;
  scaleFactor: number;
}

interface ScreenApiLike {
  getPrimaryDisplay(): ElectronDisplay;
  getAllDisplays(): ElectronDisplay[];
}

interface ElectronImageLike {
  toPNG(): Buffer;
  toJPEG(quality: number): Buffer;
  getSize(): { width: number; height: number };
  crop(rect: Rect): ElectronImageLike;
}

interface DesktopCapturerSource {
  id: string;
  name: string;
  display_id?: string;
  thumbnail: ElectronImageLike;
}

interface DesktopCapturerLike {
  getSources(opts: {
    types: Array<'screen' | 'window'>;
    thumbnailSize?: { width: number; height: number };
    fetchWindowIcons?: boolean;
  }): Promise<DesktopCapturerSource[]>;
}

class ScreenServiceImpl implements ScreenService {
  constructor(
    private readonly screenApi: ScreenApiLike,
    private readonly desktopCapturer: DesktopCapturerLike,
    private readonly cfg: ScreenPluginConfig,
  ) {}

  async listDisplays(): Promise<DisplayInfo[]> {
    const primary = this.screenApi.getPrimaryDisplay();
    return this.screenApi.getAllDisplays().map((d) => ({
      id: String(d.id),
      name: d.label ?? `Display ${d.id}`,
      primary: d.id === primary.id,
      bounds: { ...d.bounds },
      scaleFactor: d.scaleFactor,
    }));
  }

  async capture(opts: CaptureOptions = {}): Promise<CaptureResult> {
    const displays = await this.listDisplays();
    const target = opts.displayId
      ? displays.find((d) => d.id === opts.displayId)
      : (displays.find((d) => d.primary) ?? displays[0]);
    if (!target) throw new Error('[ScreenPlugin] no display available');

    const maxW =
      opts.maxWidth ??
      this.cfg.thumbnailMaxWidth ??
      Math.round(target.bounds.width * target.scaleFactor);
    const maxH =
      opts.maxHeight ??
      this.cfg.thumbnailMaxHeight ??
      Math.round(target.bounds.height * target.scaleFactor);

    const sources = await this.desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxW, height: maxH },
    });
    const src =
      sources.find((s) => s.display_id === target.id) ??
      sources.find((s) => s.id.endsWith(`:${target.id}:0`)) ??
      sources[0];
    if (!src)
      throw new Error(`[ScreenPlugin] capturer returned no source for display ${target.id}`);

    let image = src.thumbnail;
    if (opts.area) {
      image = image.crop(opts.area);
    }
    const size = image.getSize();
    const mime = opts.mime ?? 'image/png';
    const buf = mime === 'image/jpeg' ? image.toJPEG(85) : image.toPNG();

    return {
      displayId: target.id,
      mime,
      data: new Uint8Array(buf),
      width: size.width,
      height: size.height,
      capturedAt: Date.now(),
    };
  }
}

export const ScreenPlugin = definePlugin<ScreenPluginConfig>({
  name: 'ScreenPlugin',
  apply(ctx: PluginContext, cfg: ScreenPluginConfig) {
    const electron = loadElectron() as unknown as {
      screen: ScreenApiLike;
      desktopCapturer: DesktopCapturerLike;
    };
    const svc = new ScreenServiceImpl(electron.screen, electron.desktopCapturer, cfg);
    ctx.provide(ScreenKey, svc);
    ctx.logger.info('ScreenPlugin ready');
  },
});
