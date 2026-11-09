export const ASTRO_READING_TOPICS = {
  overview: {
    label: '综合解读', description: '从整体轮廓、核心需求与生活主题展开。',
    questions: ['我的星盘有哪些值得关注的特点？', '我的优势和内在需求如何相互影响？', '我可以从哪些方向更了解自己？'],
  },
  strengths: {
    label: '性格与优势', description: '了解表达风格、个人优势与成长空间。',
    questions: ['我的性格中有哪些突出的优势？', '我通常怎样表达自己？', '我的哪些特点可以相互补充？'],
  },
  emotions: {
    label: '情绪与内在需求', description: '探索情绪反应、安全感与内在需求。',
    questions: ['我通常需要怎样的情绪支持？', '什么样的环境更容易让我感到安心？', '我怎样理解自己的情绪反应？'],
  },
  career: {
    label: '事业与发展', description: '梳理工作风格、发展动力与适合探索的方向。',
    questions: ['我在工作中更容易发挥哪些优势？', '什么样的工作方式更适合我？', '我怎样理解成就感与发展动力？'],
  },
  wealth: {
    label: '财运与金钱观', description: '从金钱观、资源积累与价值感展开。',
    questions: ['我的金钱观有什么特点？', '我在积累资源方面有哪些倾向？', '我怎样理解工作与收入之间的关系？'],
  },
  relationships: {
    label: '感情与关系', description: '了解亲密需求、相处方式与关系中的沟通。',
    questions: ['我在亲密关系中重视什么？', '我习惯怎样表达关心与需求？', '我的独立需求与亲密需求如何平衡？'],
  },
  family: {
    label: '家庭与归属', description: '探索家庭体验、生活根基与归属感。',
    questions: ['我怎样理解家庭与归属感？', '什么样的生活空间更让我感到安定？', '我的内在需求如何影响家庭相处？'],
  },
  growth: {
    label: '学习与成长', description: '发现学习方式、好奇心与自我成长的动力。',
    questions: ['我更习惯怎样学习和理解新事物？', '哪些主题更容易激发我的好奇心？', '我怎样把自己的优势用于持续成长？'],
  },
} as const;

export type AstroReadingTopic = keyof typeof ASTRO_READING_TOPICS;
export const ASTRO_READING_TOPIC_IDS = Object.keys(ASTRO_READING_TOPICS) as [AstroReadingTopic, ...AstroReadingTopic[]];
