/* global UtSystem, document */
import LAppDefine from './LAppDefine';
import { L2DBaseModel, Live2DFramework, L2DEyeBlink, L2DMotionManager } from './Live2DFramework';
import MatrixStack from './utils/MatrixStack';
import ModelSettingJson from './utils/ModelSettingJson';

import logger from '@/utils/logger';

// 声明全局变量
declare const UtSystem: {
  getUserTimeMSec(): number;
};

//============================================================
//============================================================
//  class LAppModel     extends L2DBaseModel
//============================================================
//============================================================
class LAppModel extends L2DBaseModel {
  modelHomeDir: string = '';
  modelSetting: ModelSettingJson | null = null;
  tmpMatrix: number[] = [];

  constructor() {
    super();
  }

  loadJSON(callback: () => void): void {
    if (!this.modelSetting) return;

    const path = this.modelHomeDir + this.modelSetting.getModelFile();

    this.loadModelData(path, () => {
      for (let i = 0; i < this.modelSetting!.getTextureNum(); i++) {
        const texPaths = this.modelHomeDir + this.modelSetting!.getTextureFile(i);

        this.loadTexture(i, texPaths, () => {
          if (this.isTexLoaded) {
            if (this.modelSetting!.getExpressionNum() > 0) {
              this.expressions = {};

              for (let j = 0; j < this.modelSetting!.getExpressionNum(); j++) {
                const expName = this.modelSetting!.getExpressionName(j);
                if (!expName) continue;

                const expFilePath = this.modelHomeDir + this.modelSetting!.getExpressionFile(j);

                this.loadExpression(expName, expFilePath);
              }
            } else {
              this.expressionManager = new L2DMotionManager();
              this.expressions = {};
            }

            if (this.eyeBlink == null) {
              this.eyeBlink = new L2DEyeBlink();
            }

            if (this.modelSetting!.getPhysicsFile() != null) {
              this.loadPhysics(this.modelHomeDir + this.modelSetting!.getPhysicsFile()!);
            } else {
              this.physics = null;
            }

            if (this.modelSetting!.getPoseFile() != null) {
              this.loadPose(this.modelHomeDir + this.modelSetting!.getPoseFile()!, () => {
                if (this.pose) {
                  this.pose.updateParam(this.live2DModel);
                }
              });
            } else {
              this.pose = null;
            }

            if (this.modelSetting!.getLayout() != null) {
              const layout = this.modelSetting!.getLayout();

              if (layout['width'] != null && this.modelMatrix) {
                this.modelMatrix.setWidth(layout['width']);
              }
              if (layout['height'] != null && this.modelMatrix) {
                this.modelMatrix.setHeight(layout['height']);
              }

              if (layout['x'] != null && this.modelMatrix) this.modelMatrix.setX(layout['x']);
              if (layout['y'] != null && this.modelMatrix) this.modelMatrix.setY(layout['y']);
              if (layout['center_x'] != null && this.modelMatrix)
                this.modelMatrix.centerX(layout['center_x']);
              if (layout['center_y'] != null && this.modelMatrix)
                this.modelMatrix.centerY(layout['center_y']);
              if (layout['top'] != null && this.modelMatrix) this.modelMatrix.top(layout['top']);
              if (layout['bottom'] != null && this.modelMatrix)
                this.modelMatrix.bottom(layout['bottom']);
              if (layout['left'] != null && this.modelMatrix) this.modelMatrix.left(layout['left']);
              if (layout['right'] != null && this.modelMatrix)
                this.modelMatrix.right(layout['right']);
            }

            for (let j = 0; j < this.modelSetting!.getInitParamNum(); j++) {
              this.live2DModel.setParamFloat(
                this.modelSetting!.getInitParamID(j),
                this.modelSetting!.getInitParamValue(j),
              );
            }

            for (let j = 0; j < this.modelSetting!.getInitPartsVisibleNum(); j++) {
              this.live2DModel.setPartsOpacity(
                this.modelSetting!.getInitPartsVisibleID(j),
                this.modelSetting!.getInitPartsVisibleValue(j),
              );
            }

            this.live2DModel.saveParam();

            this.preloadMotionGroup(LAppDefine.MOTION_GROUP_IDLE);
            this.mainMotionManager.stopAllMotions();

            this.setUpdating(false);
            this.setInitialized(true);

            if (typeof callback === 'function') callback();
          }
        });
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
  async loadModelSetting(modelSettingPath: string, modelSetting: any): Promise<void> {
    this.setUpdating(true);
    this.setInitialized(false);

    this.modelHomeDir = modelSettingPath.substring(0, modelSettingPath.lastIndexOf('/') + 1);

    this.modelSetting = new ModelSettingJson();
    this.modelSetting.json = modelSetting;
    await new Promise<void>((resolve) => this.loadJSON(resolve));
  }

  load(gl: WebGLRenderingContext, modelSettingPath: string, callback: () => void): void {
    this.setUpdating(true);
    this.setInitialized(false);

    this.modelHomeDir = modelSettingPath.substring(0, modelSettingPath.lastIndexOf('/') + 1);

    this.modelSetting = new ModelSettingJson();

    this.modelSetting.loadModelSetting(modelSettingPath, () => {
      this.loadJSON(callback);
    });
  }

  release(gl: WebGLRenderingContext): void {
    const pm = Live2DFramework.getPlatformManager();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
    gl.deleteTexture((pm as any).texture);
  }

  preloadMotionGroup(name: string): void {
    if (!this.modelSetting) return;

    const motionNum = this.modelSetting.getMotionNum(name);
    if (motionNum <= 0) {
      logger.trace(`Motion group '${name}' not found or empty, skipping preload.`);
      return;
    }

    for (let i = 0; i < motionNum; i++) {
      const file = this.modelSetting.getMotionFile(name, i);
      if (!file) continue;

      this.loadMotion(file, this.modelHomeDir + file, (motion) => {
        if (!motion) return;

        motion.setFadeIn(this.modelSetting!.getMotionFadeIn(name, i));
        motion.setFadeOut(this.modelSetting!.getMotionFadeOut(name, i));
      });
    }
  }

  update(): void {
    if (this.live2DModel == null) {
      logger.error('Failed to update.');
      return;
    }

    const timeMSec = UtSystem.getUserTimeMSec() - (this.startTimeMSec || 0);
    const timeSec = timeMSec / 1000.0;
    const t = timeSec * 2 * Math.PI;

    if (this.mainMotionManager.isFinished()) {
      if (this.modelSetting && this.modelSetting.getMotionNum(LAppDefine.MOTION_GROUP_IDLE) > 0) {
        this.startRandomMotion(LAppDefine.MOTION_GROUP_IDLE, LAppDefine.PRIORITY_IDLE);
      }
    }

    //-----------------------------------------------------------------

    this.live2DModel.loadParam();

    const update = this.mainMotionManager.updateParam(this.live2DModel);
    if (!update) {
      if (this.eyeBlink != null) {
        this.eyeBlink.updateParam(this.live2DModel);
      }
    }

    this.live2DModel.saveParam();

    //-----------------------------------------------------------------

    if (
      this.expressionManager != null &&
      this.expressions != null &&
      !this.expressionManager.isFinished()
    ) {
      this.expressionManager.updateParam(this.live2DModel);
    }

    this.live2DModel.addToParamFloat('PARAM_ANGLE_X', this.dragX * 30, 1);
    this.live2DModel.addToParamFloat('PARAM_ANGLE_Y', this.dragY * 30, 1);
    this.live2DModel.addToParamFloat('PARAM_ANGLE_Z', this.dragX * this.dragY * -30, 1);

    this.live2DModel.addToParamFloat('PARAM_BODY_ANGLE_X', this.dragX * 10, 1);

    this.live2DModel.addToParamFloat('PARAM_EYE_BALL_X', this.dragX, 1);
    this.live2DModel.addToParamFloat('PARAM_EYE_BALL_Y', this.dragY, 1);

    this.live2DModel.addToParamFloat('PARAM_ANGLE_X', Number(15 * Math.sin(t / 6.5345)), 0.5);
    this.live2DModel.addToParamFloat('PARAM_ANGLE_Y', Number(8 * Math.sin(t / 3.5345)), 0.5);
    this.live2DModel.addToParamFloat('PARAM_ANGLE_Z', Number(10 * Math.sin(t / 5.5345)), 0.5);
    this.live2DModel.addToParamFloat('PARAM_BODY_ANGLE_X', Number(4 * Math.sin(t / 15.5345)), 0.5);
    this.live2DModel.setParamFloat('PARAM_BREATH', Number(0.5 + 0.5 * Math.sin(t / 3.2345)), 1);

    if (this.physics != null) {
      this.physics.updateParam(this.live2DModel);
    }

    // lipSync 默认为 false（不是 null），旧条件 `== null` 永远不成立，导致 TTS 嘴型不生效。
    // 显式开启 lipSync，或外部（lipSyncStore → setLipSyncValue）写入了非零值时驱动嘴型。
    if (this.lipSync || this.lipSyncValue > 0) {
      this.live2DModel.setParamFloat('PARAM_MOUTH_OPEN_Y', this.lipSyncValue);
    }

    if (this.pose != null) {
      this.pose.updateParam(this.live2DModel);
    }

    this.live2DModel.update();
  }

  setRandomExpression(): void {
    const tmp: string[] = [];
    for (const name in this.expressions) {
      tmp.push(name);
    }

    const no = parseInt(String(Math.random() * tmp.length));

    this.setExpression(tmp[no]);
  }

  startRandomMotion(name: string, priority: number): void {
    if (!this.modelSetting) return;

    const max = this.modelSetting.getMotionNum(name);
    if (max <= 0) {
      logger.trace(`Motion group '${name}' not found or empty.`);
      return;
    }

    const no = parseInt(String(Math.random() * max));
    this.startMotion(name, no, priority);
  }

  startMotion(name: string, no: number, priority: number): void {
    if (!this.modelSetting) return;

    const motionName = this.modelSetting.getMotionFile(name, no);

    if (motionName == null || motionName == '') {
      logger.error('Failed to motion.');
      return;
    }

    if (priority == LAppDefine.PRIORITY_FORCE) {
      this.mainMotionManager.setReservePriority(priority);
    } else if (!this.mainMotionManager.reserveMotion(priority)) {
      logger.trace('Motion is running.');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
    let motion: any;

    if (this.motions[name] == null) {
      this.loadMotion(null, this.modelHomeDir + motionName, (mtn) => {
        motion = mtn;

        this.setFadeInFadeOut(name, no, priority, motion);
      });
    } else {
      motion = this.motions[name];

      this.setFadeInFadeOut(name, no, priority, motion);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 遗留代码，沿用既有类型
  setFadeInFadeOut(name: string, no: number, priority: number, motion: any): void {
    if (!this.modelSetting) return;

    const motionName = this.modelSetting.getMotionFile(name, no);
    if (!motionName) return;

    motion.setFadeIn(this.modelSetting.getMotionFadeIn(name, no));
    motion.setFadeOut(this.modelSetting.getMotionFadeOut(name, no));

    logger.trace('Start motion : ' + motionName);

    if (this.modelSetting.getMotionSound(name, no) == null) {
      this.mainMotionManager.startMotionPrio(motion, priority);
    } else {
      const soundName = this.modelSetting.getMotionSound(name, no);

      const snd = document.createElement('audio');
      snd.src = this.modelHomeDir + soundName;

      logger.trace('Start sound : ' + soundName);

      snd.play();
      this.mainMotionManager.startMotionPrio(motion, priority);
    }
  }

  setExpression(name: string): void {
    const motion = this.expressions[name];

    logger.trace('Expression : ' + name);

    this.expressionManager.startMotion(motion, false);
  }

  draw(gl: WebGLRenderingContext): void {
    MatrixStack.push();

    if (this.modelMatrix) {
      MatrixStack.multMatrix(this.modelMatrix.getArray());
    }

    this.tmpMatrix = MatrixStack.getMatrix();
    this.live2DModel.setMatrix(this.tmpMatrix);
    this.live2DModel.draw();

    MatrixStack.pop();
  }

  hitTest(id: string, testX: number, testY: number): boolean {
    if (!this.modelSetting) return false;

    const len = this.modelSetting.getHitAreaNum();
    for (let i = 0; i < len; i++) {
      if (id == this.modelSetting.getHitAreaName(i)) {
        const drawID = this.modelSetting.getHitAreaID(i);
        if (!drawID) continue;

        return this.hitTestSimple(drawID, testX, testY);
      }
    }

    return false;
  }
}

export default LAppModel;
