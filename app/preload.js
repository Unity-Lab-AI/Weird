// Bridge between the setup / boot pages and the main process. Nothing else is exposed to page scripts.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dmthApp', {
  onStatus: cb => ipcRenderer.on('dmth:status', (_e, name, s) => cb(name, s)),
  onLog: cb => ipcRenderer.on('dmth:log', (_e, line) => cb(line)),
  onSetupEvent: cb => ipcRenderer.on('dmth:setup:event', (_e, ev) => cb(ev)),
  status: () => ipcRenderer.invoke('dmth:status'),
  system: () => ipcRenderer.invoke('dmth:system'),
  setupPlan: () => ipcRenderer.invoke('dmth:setup:plan'),
  setupStart: () => ipcRenderer.invoke('dmth:setup:start'),
  purge: () => ipcRenderer.invoke('dmth:purge'),
  quit: () => ipcRenderer.invoke('dmth:quit'),
});
