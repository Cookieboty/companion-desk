const fs = require('fs');
const path = require('path');

// 模型目录路径
const MOC_DIR = path.join(__dirname, '../packages/renderer/public/assets/models/moc');
const OUTPUT_FILE = path.join(__dirname, '../packages/renderer/public/assets/model_list.json');

// 模型分类配置
const MODEL_CATEGORIES = {
  // 少女前线系列（以数字+下划线命名）
  GIRLS_FRONTLINE: /^[a-z0-9]+_\d+$/,

  // 22/33 号舰娘系列
  BILIBILI_SERIES: /^(22|33)\./,

  // potion-Maker 系列
  POTION_MAKER: /^potion-Maker-/,

  // 特殊命名的角色
  SPECIAL_CHARACTERS: [
    'z16', 'YuzukiYukari', 'yuri', 'yukari_model', 'wed_16', 'wanko',
    'unitychan', 'umaru', 'uiharu', 'tsumiki', 'touma', 'tororo', 'tia',
    'stl', 'snow_miku', 'shizuku-pajama', 'shizuku-48', 'shizuku',
    'shifuku2', 'shifuku', 'seifuku', 'saten', 'sagiri', 'ryoufuku',
    'rem', 'poi', 'PLT', 'platelet', 'Pio', 'penchan', 'nito', 'nipsilon',
    'nietzsche', 'nico', 'ni-j', 'neptune', 'nepmaid', 'nep', 'murakumo',
    'miku', 'mikoto', 'makoto0', 'madoka', 'len_swim', 'len_space',
    'len_impact', 'len', 'kurumi', 'kuroko', 'koharu', 'Kobayaxi',
    'kesyoban', 'kesshouban', 'kanzaki', 'kanna', 'jin', 'izumi', 'index',
    'iio', 'histoire', 'hijiki', 'hibiki', 'haruto', 'haru02', 'haru01',
    'hallo_16', 'girls-frontline', 'gf', 'Gantzert_Felixander', 'Epsilon2.1',
    'Epsilon', 'date_16', 'chitose', 'chino', 'chiaki_kitty', 'Bronya',
    'bilibili-33', 'bilibili-22', 'aoba'
  ]
};

// 模型名称到显示名称的映射
const MODEL_DISPLAY_NAMES = {
  // potion-Maker 系列
  'potion-Maker-Pio': '来自 Potion Maker 的 Pio 酱',
  'potion-Maker-Tia': '来自 Potion Maker 的 Tia 酱',

  // bilibili 系列
  'bilibili-22': '来自 Bilibili 的 22 号',
  'bilibili-33': '来自 Bilibili 的 33 号',

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

  // 默认显示名称生成
  default: (name) => {
    // 如果是少女前线模型，尝试解析名称
    if (MODEL_CATEGORIES.GIRLS_FRONTLINE.test(name)) {
      const gunName = name.split('_')[0].toUpperCase();
      return `${gunName} (少女前线)`;
    }

    // 如果是22/33系列，生成友好名称
    if (MODEL_CATEGORIES.BILIBILI_SERIES.test(name)) {
      const parts = name.split('.');
      const number = parts[0];
      const variant = parts.slice(1).join(' ');
      return `${number}号 ${variant || '默认'}`;
    }

    // 其他情况直接使用名称
    return name;
  }
};

/**
 * 检查目录是否包含有效的模型文件
 */
function hasValidModelFile(modelDir) {
  const possibleFiles = ['index.json', `${path.basename(modelDir)}.model.json`];

  for (const file of possibleFiles) {
    const filePath = path.join(modelDir, file);
    if (fs.existsSync(filePath)) {
      return true;
    }
  }

  return false;
}

/**
 * 扫描 moc 目录并生成模型列表
 */
function scanModels() {
  if (!fs.existsSync(MOC_DIR)) {
    console.error('MOC 目录不存在:', MOC_DIR);
    process.exit(1);
  }

  const items = fs.readdirSync(MOC_DIR);
  const models = [];
  const messages = [];

  // 按类别分组模型
  const categories = {
    girlsFrontline: [],
    bilibilliSeries: {},  // 按系列号分组
    potionMaker: [],
    specialCharacters: [],
    others: []
  };

  console.log('扫描模型目录...');

  for (const item of items) {
    const itemPath = path.join(MOC_DIR, item);
    const stat = fs.statSync(itemPath);

    if (!stat.isDirectory()) continue;

    // 检查是否包含有效的模型文件
    if (!hasValidModelFile(itemPath)) {
      console.warn(`跳过无效模型目录: ${item}`);
      continue;
    }

    console.log(`发现模型: ${item}`);

    // 分类模型
    if (MODEL_CATEGORIES.GIRLS_FRONTLINE.test(item)) {
      categories.girlsFrontline.push(item);
    } else if (MODEL_CATEGORIES.BILIBILI_SERIES.test(item)) {
      const seriesNumber = item.split('.')[0];
      if (!categories.bilibilliSeries[seriesNumber]) {
        categories.bilibilliSeries[seriesNumber] = [];
      }
      categories.bilibilliSeries[seriesNumber].push(item);
    } else if (MODEL_CATEGORIES.POTION_MAKER.test(item)) {
      categories.potionMaker.push(item);
    } else if (MODEL_CATEGORIES.SPECIAL_CHARACTERS.includes(item)) {
      categories.specialCharacters.push(item);
    } else {
      categories.others.push(item);
    }
  }

  // 生成模型配置
  console.log('生成模型配置...');

  // 添加 potion-Maker 系列
  categories.potionMaker.sort().forEach(model => {
    models.push(model);
    messages.push(MODEL_DISPLAY_NAMES[model] || MODEL_DISPLAY_NAMES.default(model));
  });

  // 添加 bilibili 系列（按系列号分组）
  Object.keys(categories.bilibilliSeries).sort().forEach(seriesNumber => {
    const seriesModels = categories.bilibilliSeries[seriesNumber].sort();
    if (seriesModels.length > 1) {
      // 多个变体作为数组
      models.push(seriesModels);
      messages.push(`${seriesNumber}号舰娘系列`);
    } else {
      // 单个模型
      models.push(seriesModels[0]);
      messages.push(MODEL_DISPLAY_NAMES[seriesModels[0]] || MODEL_DISPLAY_NAMES.default(seriesModels[0]));
    }
  });

  // 添加特殊角色（按字母排序）
  categories.specialCharacters.sort().forEach(model => {
    models.push(model);
    messages.push(MODEL_DISPLAY_NAMES[model] || MODEL_DISPLAY_NAMES.default(model));
  });

  // 添加少女前线系列（限制数量，避免列表过长）
  const selectedGF = categories.girlsFrontline.sort().slice(0, 10); // 只取前10个
  if (selectedGF.length > 0) {
    models.push(selectedGF);
    messages.push('少女前线系列');
  }

  // 添加其他模型
  categories.others.sort().forEach(model => {
    models.push(model);
    messages.push(MODEL_DISPLAY_NAMES[model] || MODEL_DISPLAY_NAMES.default(model));
  });

  return {
    models,
    messages
  };
}

/**
 * 生成配置文件
 */
function generateConfig() {
  try {
    console.log('开始扫描模型...');
    const config = scanModels();

    console.log(`找到 ${config.models.length} 个模型/系列`);

    // 写入配置文件
    const configContent = JSON.stringify(config, null, 2);
    fs.writeFileSync(OUTPUT_FILE, configContent, 'utf8');

    console.log(`模型配置已生成: ${OUTPUT_FILE}`);
    console.log('模型列表预览:');
    config.models.forEach((model, index) => {
      const modelName = Array.isArray(model) ? `[${model.length}个变体] ${model[0]}等` : model;
      console.log(`  ${index + 1}. ${modelName} - ${config.messages[index]}`);
    });

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