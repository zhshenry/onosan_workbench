declare global {
  interface Window {
    workbench: import('../shared/workbench-api').WorkbenchApi;
  }
}

export {};
