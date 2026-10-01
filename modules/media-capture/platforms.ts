/** 自媒体浏览器起始页的常驻平台快捷入口(v1 固定;后续可做自定义)。 */
export interface MediaPlatform { name: string; url: string; dot: string; }

export const MEDIA_PLATFORMS: MediaPlatform[] = [
  { name: '小红书', url: 'https://www.xiaohongshu.com/explore', dot: '#e8494f' },
  { name: 'B 站', url: 'https://www.bilibili.com', dot: '#ef7ba5' },
  { name: '知乎', url: 'https://www.zhihu.com/hot', dot: '#4a7dc9' },
  { name: '微博', url: 'https://weibo.com', dot: '#e0762e' },
  { name: '抖音创作', url: 'https://creator.douyin.com', dot: '#2a2c31' },
];
