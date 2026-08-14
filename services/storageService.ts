import { ProjectState } from '../types';

const DB_NAME = 'CineGenDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const CHANNEL_NAME = 'cinegen-project-sync';

type ProjectSyncEvent = { type: 'saved' | 'deleted'; projectId: string; senderId: string };
const senderId = `tab_${Math.random().toString(36).slice(2)}`;
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export const saveProjectToDB = async (project: ProjectState): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const p = { ...project, lastModified: Date.now() };
    const request = store.put(p);
    request.onsuccess = () => {
      channel?.postMessage({ type: 'saved', projectId: project.id, senderId } satisfies ProjectSyncEvent);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
};

export const getAllProjectsMetadata = async (): Promise<ProjectState[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll(); 
    request.onsuccess = () => {
       const projects = request.result as ProjectState[];
       // Sort by last modified descending
       projects.sort((a, b) => b.lastModified - a.lastModified);
       resolve(projects);
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteProjectFromDB = async (id: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => {
      channel?.postMessage({ type: 'deleted', projectId: id, senderId } satisfies ProjectSyncEvent);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
};

export const getProjectById = async (id: string): Promise<ProjectState | undefined> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as ProjectState | undefined);
    request.onerror = () => reject(request.error);
  });
};

export const subscribeToProjectSync = (listener: (event: ProjectSyncEvent) => void): (() => void) => {
  if (!channel) return () => undefined;
  const handle = (event: MessageEvent<ProjectSyncEvent>) => {
    if (event.data?.senderId !== senderId) listener(event.data);
  };
  channel.addEventListener('message', handle);
  return () => channel.removeEventListener('message', handle);
};

// Initial template for new projects
export const createNewProjectState = (settings: Pick<ProjectState, 'title' | 'artStyle' | 'styleTags' | 'aspectRatio' | 'targetDuration' | 'language'>): ProjectState => {
  const id = 'proj_' + Date.now().toString(36);
  return {
    id,
    artStyle: settings.artStyle || '日漫赛璐璐',
    styleTags: settings.styleTags || [],
    aspectRatio: settings.aspectRatio || '16:9',
    title: '未命名项目',
    createdAt: Date.now(),
    lastModified: Date.now(),
    stage: 'script',
    targetDuration: '60s', // Default duration now 60s
    language: '中文', // Default language
    rawScript: `标题：示例剧本

场景 1
外景。夜晚街道 - 雨夜
霓虹灯在水坑中反射出破碎的光芒。
侦探（30岁，穿着风衣）站在街角，点燃了一支烟。

侦探
这雨什么时候才会停？`,
    scriptData: null,
    shots: [],
    isParsingScript: false,
  };
};
