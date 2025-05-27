const fs = require('fs');
const path = require('path');

// 模型目录路径
const MOC_DIR = path.join(__dirname, '../packages/renderer/public/assets/models');
const OUTPUT_FILE = path.join(__dirname, '../packages/renderer/public/assets/costume_model_list.json');

// 模型名称到显示名称的映射
const MODEL_DISPLAY_NAMES = {
  // potion-Maker 系列
  'potion-Maker-Pio': '来自 Potion Maker 的 Pio 酱',
  'potion-Maker-Tia': '来自 Potion Maker 的 Tia 酱',

  // 常见角色
  'miku': '初音未来',
  'unitychan': 'Unity酱',
  'rem': '蕾姆',
  'z16': 'Z16 驱逐舰',
  'yukari_model': '紫妈',
  'umaru': '小埋',
  'sagiri': '纱雾',
  'kurumi': '狂三',
  'madoka': '小圆',
  'neptune': '海王星',
  'nep': 'Nep',
  'nepmaid': '海王星女仆',
  'snow_miku': '雪初音',
  'platelet': '血小板',
  'kesshouban': '血小板',
  'Bronya': '布洛妮娅',
  'chino': '智乃',
  'kanna': '康娜',
  'shizuku': '雫',
  'shizuku-48': '雫 (48)',
  'shizuku-pajama': '雫 (睡衣)',
  'aoba': '青叶',
  'chitose': '千岁',
  'bilibili-22': 'Bilibili 22号',
  'bilibili-33': 'Bilibili 33号',

  // 少女前线系列
  'hk416': 'HK416',
  'g36': 'G36',
  'g41': 'G41',
  'ump45': 'UMP45',
  'ump9': 'UMP9',
  'vector': 'Vector',
  'grizzly': 'Grizzly',
  'welrod': 'Welrod',
  'wa2000': 'WA2000',
  'rfb': 'RFB',
  'dsr50': 'DSR-50',
  'ntw20': 'NTW-20',
  'k2': 'K2',
  'type88': 'Type 88',
  'type64-ar': 'Type 64',
  'sat8': 'SAT8',
  'r93': 'R93',
  'px4storm': 'PX4 Storm',
  'pkp': 'PKP',
  'ots14': 'OTs-14',
  'm950a': 'M950A',
  'm1928a1': 'M1928A1',
  'lewis': 'Lewis',
  'kp31': 'KP-31',
  'fn57': 'FN57',
  'g36c': 'G36C',
  'carcano1891': 'Carcano M1891',
  'carcano1938': 'Carcano M38',
  'cbjms': 'CBJMS',
  'contender': 'Contender',
  'aa12': 'AA-12',
  'ads': 'ADS',
  'ak12': 'AK-12',
  'an94': 'AN-94',
  '95type': '95式',
  'mlemk1': 'MLE MK1',

  // 默认显示名称生成
  default: (name) => {
    // 处理带下划线的少女前线模型
    if (name.includes('_')) {
      const parts = name.split('_');
      const gunName = parts[0].toUpperCase();
      return `${gunName} (少女前线)`;
    }

    // 处理带点号的模型
    if (name.includes('.')) {
      const parts = name.split('.');
      const baseName = parts[0];
      if (/^\d+$/.test(baseName)) {
        return `${baseName}号舰娘`;
      }
      return baseName;
    }

    // 其他情况直接使用名称
    return name;
  }
};

/**
 * 检查目录是否包含有效的模型文件
 */
function hasValidModelFile(modelDir) {
  try {
    const files = fs.readdirSync(modelDir);

    // 检查是否有模型文件：.model.json, model.json, index.json
    const modelFiles = files.filter(file =>
      file.endsWith('.model.json') ||
      file === 'model.json' ||
      file === 'index.json'
    );

    return modelFiles.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * 检查模型是否有换装功能
 */
function hasCostumeFeature(modelDir) {
  const files = fs.readdirSync(modelDir);

  // 检查是否有默认模型文件
  const hasDefault = files.includes('default.model.json') ||
    files.includes('model.default.json') ||
    files.includes('index.json') ||
    files.some(file => file.includes('.default.model.json'));

  // 检查是否有多个模型文件
  const modelFiles = files.filter(file =>
    file.endsWith('.model.json') ||
    file === 'model.json' ||
    file === 'index.json'
  );

  return hasDefault && modelFiles.length > 1;
}

/**
 * 获取模型的所有换装配置
 */
function getModelCostumes(modelDir, modelName) {
  const files = fs.readdirSync(modelDir);

  // 获取所有模型文件：.model.json, model.json, index.json
  const modelFiles = files.filter(file =>
    file.endsWith('.model.json') ||
    file === 'model.json' ||
    file === 'index.json'
  );

  // 查找默认模型文件，优先级顺序
  let defaultFile = null;

  // 1. 查找明确的默认文件
  const defaultCandidates = [
    'default.model.json',
    'model.default.json',
    'index.json'
  ];

  for (const candidate of defaultCandidates) {
    if (files.includes(candidate)) {
      defaultFile = candidate;
      break;
    }
  }

  // 2. 查找包含.default.的文件
  if (!defaultFile) {
    defaultFile = files.find(file => file.includes('.default.model.json'));
  }

  // 3. 如果只有一个模型文件，则作为默认模型
  if (!defaultFile && modelFiles.length === 1) {
    defaultFile = modelFiles[0];
  }

  // 4. 如果还没找到，使用第一个模型文件
  if (!defaultFile) {
    defaultFile = modelFiles[0];
  }

  // 构建默认模型路径
  const defaultPath = `${modelName}/${defaultFile}`;

  // 如果只有一个模型文件，返回单一模型配置
  if (modelFiles.length === 1) {
    return {
      path: defaultPath,
      costumes: null
    };
  }

  // 如果有多个模型文件，构建换装配置
  const costumes = modelFiles
    .filter(file => file !== defaultFile)
    .map(file => `${modelName}/${file}`);

  return {
    path: defaultPath,
    costumes: costumes.length > 0 ? costumes : null
  };
}


/**
 * 扫描 models 目录并生成模型列表
 */
function scanModels() {
  if (!fs.existsSync(MOC_DIR)) {
    console.error('MOC 目录不存在:', MOC_DIR);
    process.exit(1);
  }

  const items = fs.readdirSync(MOC_DIR);
  const models = [];

  // 处理特殊模型组
  // const specialModels = processSpecialModelGroups();
  // models.push(...specialModels);

  // 获取特殊模型组的目录名，用于跳过
  const specialDirs = new Set();

  console.log('扫描普通模型目录...');

  for (const item of items) {
    // 跳过特殊模型组目录
    if (specialDirs.has(item)) {
      continue;
    }

    const itemPath = path.join(MOC_DIR, item);

    try {
      const stat = fs.statSync(itemPath);
      if (!stat.isDirectory()) continue;
    } catch (error) {
      console.warn(`无法访问目录: ${item}`);
      continue;
    }

    // 检查是否包含有效的模型文件
    if (!hasValidModelFile(itemPath)) {
      console.warn(`跳过无效模型目录: ${item}`);
      continue;
    }

    console.log(`发现模型: ${item}`);

    // 获取模型配置
    const modelConfig = getModelCostumes(itemPath, item);

    // 生成显示名称
    const displayName = MODEL_DISPLAY_NAMES[item] || MODEL_DISPLAY_NAMES.default(item);

    // 构建模型配置对象
    const modelEntry = {
      name: item,
      path: modelConfig.path,
      message: displayName
    };

    // 如果有换装功能，添加换装路径
    if (modelConfig.costumes) {
      modelEntry.costumes = modelConfig.costumes;
    }

    models.push(modelEntry);
  }

  // 按名称排序
  models.sort((a, b) => a.name.localeCompare(b.name));

  return models;
}

/**
 * 生成配置文件
 */
function generateConfig() {
  try {
    console.log('开始扫描模型...');
    const models = scanModels();

    console.log(`找到 ${models.length} 个模型`);

    // 统计换装模型数量
    const costumeModels = models.filter(model => model.costumes);
    console.log(`其中 ${costumeModels.length} 个模型支持换装功能`);

    // 生成最终配置
    const config = {
      models: models
    };

    // 写入配置文件
    const configContent = JSON.stringify(config, null, 2);
    fs.writeFileSync(OUTPUT_FILE, configContent, 'utf8');

    console.log(`模型配置已生成: ${OUTPUT_FILE}`);
    console.log('模型列表预览:');

    models.forEach((model, index) => {
      const costumeInfo = model.costumes ? ` (${model.costumes.length}个换装)` : ' (无换装)';
      console.log(`  ${index + 1}. ${model.name} - ${model.message}${costumeInfo}`);
    });

    // 输出换装模型详情
    if (costumeModels.length > 0) {
      console.log('\n换装模型详情:');
      costumeModels.forEach(model => {
        console.log(`\n${model.name} (${model.message}):`);
        console.log(`  默认: ${model.path}`);
        if (model.costumes) {
          model.costumes.forEach((costume, idx) => {
            console.log(`  换装${idx + 1}: ${costume}`);
          });
        }
      });
    }

  } catch (error) {
    console.error('生成配置文件失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  generateConfig();
}

module.exports = { generateConfig }; 