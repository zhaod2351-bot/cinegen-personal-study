import { Character, ProjectState, Scene, ScriptData, Shot } from '../types';

type RecordValue = Record<string, unknown>;

export interface ImportedStoryPlan {
  title: string;
  genre: string;
  logline: string;
  rawScript: string;
  targetDuration: string;
  language: string;
  scriptData: ScriptData;
  shots: Shot[];
}

const asRecord = (value: unknown, label: string): RecordValue => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
  return value as RecordValue;
};

const pick = (record: RecordValue, ...keys: string[]) => keys.map((key) => record[key]).find((value) => value !== undefined);

const text = (value: unknown, label: string, fallback = ''): string => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') throw new Error(`${label} 必须是文本`);
  return value.trim();
};

const list = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组`);
  return value;
};

export function buildChatGptImportPrompt(rawStory = ''): string {
  return `你是影视分镜导演。请将下面故事润色为可拍摄的短剧脚本，并且只输出一个合法 JSON 对象，不要 Markdown、解释或代码围栏。\n\nJSON 格式：\n{\n  "title":"项目标题",\n  "genre":"类型",\n  "logline":"一句话梗概",\n  "polishedScript":"润色后的完整剧本",\n  "targetDuration":"60s",\n  "language":"中文",\n  "characters":[{"name":"角色名","gender":"性别","age":"年龄","personality":"性格/剧情功能","visualPrompt":"可用于角色参考图的视觉描述"}],\n  "scenes":[{"name":"场景名","time":"时间","atmosphere":"氛围","visualPrompt":"可用于场景参考图的视觉描述"}],\n  "storyParagraphs":[{"text":"按场次拆分的剧情段落","scene":"场景名"}],\n  "shots":[{"title":"镜头标题","scene":"场景名","actionSummary":"角色动作、表演与画面内容","dialogue":"对白或旁白，可为空字符串","cameraMovement":"运镜说明","shotSize":"景别，例如中景 MS","characters":["角色名"]}]\n}\n\n严格要求：shots.scene 必须使用 scenes 中已有的 name；shots.characters 必须使用 characters 中已有的 name；每个镜头都要有动作和运镜。\n\n待处理故事：\n${rawStory || '（请在此粘贴你的故事或剧本）'}`;
}

export function parseImportedStoryPlan(json: string): ImportedStoryPlan {
  let root: RecordValue;
  try {
    root = asRecord(JSON.parse(json), '导入结果');
  } catch {
    throw new Error('无法读取 JSON。请只粘贴 ChatGPT 输出的完整 JSON，不要包含 Markdown 标记。');
  }

  const title = text(pick(root, 'title', '标题'), 'title') || '未命名项目';
  const genre = text(pick(root, 'genre', '类型'), 'genre', '剧情');
  const logline = text(pick(root, 'logline', '一句话梗概', '梗概'), 'logline');
  const rawScript = text(pick(root, 'polishedScript', 'script', '剧本', '润色剧本'), 'polishedScript');
  if (!rawScript) throw new Error('polishedScript 必须是非空文本');

  const rawCharacters = list(pick(root, 'characters', '人物', '角色'), 'characters');
  const characters: Character[] = rawCharacters.map((value, index) => {
    const item = asRecord(value, `characters[${index}]`);
    const name = text(pick(item, 'name', '名称'), `characters[${index}].name`);
    if (!name) throw new Error(`characters[${index}].name 不能为空`);
    return {
      id: `import-character-${index + 1}`,
      name,
      gender: text(pick(item, 'gender', '性别'), `characters[${index}].gender`, '未设定'),
      age: text(pick(item, 'age', '年龄'), `characters[${index}].age`, '未设定'),
      personality: text(pick(item, 'personality', '性格'), `characters[${index}].personality`, '未设定'),
      visualPrompt: text(pick(item, 'visualPrompt', '视觉描述', '提示词'), `characters[${index}].visualPrompt`),
      variations: [],
    };
  });

  const rawScenes = list(pick(root, 'scenes', '场景'), 'scenes');
  const scenes: Scene[] = rawScenes.map((value, index) => {
    const item = asRecord(value, `scenes[${index}]`);
    const location = text(pick(item, 'name', 'location', '名称'), `scenes[${index}].name`);
    if (!location) throw new Error(`scenes[${index}].name 不能为空`);
    return {
      id: `import-scene-${index + 1}`,
      location,
      time: text(pick(item, 'time', '时间'), `scenes[${index}].time`, '未设定'),
      atmosphere: text(pick(item, 'atmosphere', '氛围'), `scenes[${index}].atmosphere`, '未设定'),
      visualPrompt: text(pick(item, 'visualPrompt', '视觉描述', '提示词'), `scenes[${index}].visualPrompt`),
    };
  });

  const characterByName = new Map(characters.map((character) => [character.name, character.id]));
  const sceneByName = new Map(scenes.map((scene) => [scene.location, scene.id]));
  const rawShots = list(pick(root, 'shots', '镜头', '分镜'), 'shots');
  const shots: Shot[] = rawShots.map((value, index) => {
    const item = asRecord(value, `shots[${index}]`);
    const sceneName = text(pick(item, 'scene', '场景'), `shots[${index}].scene`);
    const sceneId = sceneByName.get(sceneName);
    if (!sceneId) throw new Error(`shots[${index}].scene “${sceneName}” 未在 scenes 中定义`);
    const names = list(pick(item, 'characters', '角色'), `shots[${index}].characters`).map((name, characterIndex) => text(name, `shots[${index}].characters[${characterIndex}]`));
    const characterIds = names.map((name) => {
      const id = characterByName.get(name);
      if (!id) throw new Error(`shots[${index}].characters 中的 “${name}” 未在 characters 中定义`);
      return id;
    });
    return {
      id: `import-shot-${index + 1}`,
      sceneId,
      actionSummary: text(pick(item, 'actionSummary', 'action', '动作'), `shots[${index}].actionSummary`),
      dialogue: text(pick(item, 'dialogue', '对白'), `shots[${index}].dialogue`, ''),
      cameraMovement: text(pick(item, 'cameraMovement', 'camera', '运镜'), `shots[${index}].cameraMovement`),
      shotSize: text(pick(item, 'shotSize', 'size', '景别'), `shots[${index}].shotSize`, '中景 MS'),
      characters: characterIds,
      keyframes: [
        { id: `import-shot-${index + 1}-start`, type: 'start', visualPrompt: '', status: 'pending' },
        { id: `import-shot-${index + 1}-end`, type: 'end', visualPrompt: '', status: 'pending' },
      ],
    };
  });

  const rawParagraphs = pick(root, 'storyParagraphs', '故事段落');
  const storyParagraphs = Array.isArray(rawParagraphs)
    ? rawParagraphs.map((value, index) => {
        const item = asRecord(value, `storyParagraphs[${index}]`);
        const sceneName = text(pick(item, 'scene', '场景'), `storyParagraphs[${index}].scene`);
        const sceneRefId = sceneByName.get(sceneName);
        if (!sceneRefId) throw new Error(`storyParagraphs[${index}].scene “${sceneName}” 未在 scenes 中定义`);
        return { id: index + 1, text: text(pick(item, 'text', '内容'), `storyParagraphs[${index}].text`), sceneRefId };
      })
    : scenes.map((scene, index) => ({ id: index + 1, text: rawScript, sceneRefId: scene.id }));

  return {
    title,
    genre,
    logline,
    rawScript,
    targetDuration: text(pick(root, 'targetDuration', '时长'), 'targetDuration', '60s'),
    language: text(pick(root, 'language', '语言'), 'language', '中文'),
    scriptData: { title, genre, logline, characters, scenes, storyParagraphs },
    shots,
  };
}

export function applyImportedStory(project: ProjectState, plan: ImportedStoryPlan): Partial<ProjectState> {
  return {
    title: plan.title,
    rawScript: plan.rawScript,
    targetDuration: plan.targetDuration,
    language: plan.language,
    scriptData: plan.scriptData,
    shots: plan.shots,
    isParsingScript: false,
    stage: 'director',
  };
}
