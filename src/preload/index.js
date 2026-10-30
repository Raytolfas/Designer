import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  saveImage: (bytes, format, quality) =>
    ipcRenderer.invoke('save-image', { bytes, format, quality }),
  saveProject: (payload) => ipcRenderer.invoke('save-project', payload),
  openProject: (payload) => ipcRenderer.invoke('open-project', payload),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  removeBackground: (payload) => ipcRenderer.invoke('remove-background', payload),
  openFile: () => ipcRenderer.invoke('open-file'),
  saveStyleFile: (payload) => ipcRenderer.invoke('save-style-file', payload),
  openStyleFile: () => ipcRenderer.invoke('open-style-file'),
  getBootstrapData: () => ipcRenderer.invoke('get-bootstrap-data'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  setProjectState: (state) => ipcRenderer.send('project-state-changed', state),
  confirmAppClose: () => ipcRenderer.send('confirm-app-close'),
  cancelAppClose: () => ipcRenderer.send('cancel-app-close'),
  onAppCloseRequested: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('app-close-requested', listener)
    return () => ipcRenderer.removeListener('app-close-requested', listener)
  },
  onOpenFilePath: (callback) => {
    const listener = (_, filePath) => callback(filePath)
    ipcRenderer.on('open-file-path', listener)
    return () => ipcRenderer.removeListener('open-file-path', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
  } catch (error) {
    console.error('Failed to expose electron API:', error)
  }
  try {
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error('Failed to expose electronAPI:', error)
  }
} else {
  window.electron = electronAPI
  window.electronAPI = api
}
