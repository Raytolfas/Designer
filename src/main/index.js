import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { basename, extname, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import { execFileSync } from 'child_process'

const APP_NAME = 'Raytolfas Designer'
const PROJECT_EXTENSION = 'rdesign'
const EXPORT_FORMATS = {
  png: { label: 'PNG', ext: 'png' },
  jpeg: { label: 'JPEG', ext: 'jpg' },
  svg: { label: 'SVG', ext: 'svg' },
  pdf: { label: 'PDF', ext: 'pdf' }
}
const STYLE_EXTENSION = 'rdtxt'
const MAX_RECENT_PROJECTS = 12

const getSettingsDir = () => join(app.getPath('documents'), 'Raytolfas', APP_NAME)
const getSettingsPath = () => join(getSettingsDir(), 'settings.json')
const getBundledConfigPath = () => join(app.getAppPath(), 'config.json')
const getWindowsRegistryPath = () =>
  join(process.env.WINDIR || 'C:\\Windows', 'System32', 'reg.exe')

const DEFAULT_SETTINGS = {
  defaultColor: '#A250FF',
  showGrid: false,
  gridSize: 24,
  snapEnabled: true,
  snapTolerance: 8,
  brushSize: 4,
  brushType: 'standard',
  brushSeed: 24091,
  brushOpacity: 100,
  brushSmoothing: 50,
  recentFonts: [],
  recentProjects: [],
  sidebarWidth: 320,
  layerPanelHeight: 320,
  fontMenuHeight: 360,
  stylePresets: [],
  language: 'en'
}

const DEFAULT_LINKS = [
  { label: 'Website', url: 'https://designer.raytolfas.com' },
  { label: 'Raytolfas', url: 'https://raytolfas.com' },
  { label: 'GitHub', url: 'https://github.com/Raytolfas/Designer' }
]

let mainWindow = null
let allowWindowClose = false
let projectCloseState = { dirty: false, hasContent: false }
let pendingOpenPath = null

const extractProjectPathFromArgv = (argv) => {
  const arg = (argv || []).find(
    (a) => typeof a === 'string' && a.toLowerCase().endsWith(`.${PROJECT_EXTENSION}`) && !a.startsWith('--')
  )
  return arg && fs.existsSync(arg) ? arg : null
}

const registerWindowsFileAssociation = () => {
  if (process.platform !== 'win32' || !app.isPackaged) return

  const registryExecutable = getWindowsRegistryPath()
  if (!fs.existsSync(registryExecutable)) return

  const executable = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
  const progId = 'Raytolfas.Designer.Project'
  const base = 'HKCU\\Software\\Classes'
  const entries = [
    [`${base}\\.${PROJECT_EXTENSION}`, '', progId],
    [`${base}\\${progId}`, '', 'Raytolfas Design File'],
    [`${base}\\${progId}\\DefaultIcon`, '', `"${executable}",0`],
    [`${base}\\${progId}\\shell\\open\\command`, '', `"${executable}" "%1"`]
  ]

  try {
    entries.forEach(([key, name, value]) => {
      const args = ['add', key, '/f', '/d', value]
      args.splice(3, 0, name ? '/v' : '/ve')
      if (name) args.splice(4, 0, name)
      execFileSync(registryExecutable, args, { windowsHide: true, timeout: 3000 })
    })
  } catch (error) {
    console.error('Failed to register file association', error)
  }
}

const getDefaultConfig = () => ({
  version: app.getVersion()
})

const ensureStorage = () => {
  fs.mkdirSync(getSettingsDir(), { recursive: true })
}

const readJsonFile = (filePath, fallbackFactory) => {
  ensureStorage()

  if (!fs.existsSync(filePath)) {
    const fallback = fallbackFactory()
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf-8')
    return fallback
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return { ...fallbackFactory(), ...parsed }
  } catch (error) {
    console.error(`Failed to read JSON file: ${filePath}`, error)
    const fallback = fallbackFactory()
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf-8')
    return fallback
  }
}

const writeJsonFile = (filePath, data) => {
  ensureStorage()
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

const readOptionalJsonFile = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch (error) {
    console.error(`Failed to read optional JSON file: ${filePath}`, error)
    return null
  }
}

const hasLetters = (value) => /\p{L}/u.test(value)

const normalizeFontName = (fileName) =>
  basename(fileName)
    .replace(/\.(ttf|otf|ttc|fon|fnt)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const cleanupFontDisplayName = (valueName) =>
  valueName
    .replace(/\s*\(.*?\)\s*$/u, '')
    .replace(/^@/u, '')
    .replace(/\s+/gu, ' ')
    .trim()

const uniqueFontList = (fonts) =>
  [...new Set((fonts || []).filter(Boolean))].sort((left, right) => left.localeCompare(right))

const getProjectNameFromPath = (filePath) => basename(filePath, extname(filePath))

const normalizeProjectFilePath = (filePath) => {
  if (!filePath || typeof filePath !== 'string') return ''

  const trimmed = filePath.trim()
  if (!trimmed) return ''

  return trimmed.toLowerCase().endsWith(`.${PROJECT_EXTENSION}`)
    ? trimmed
    : `${trimmed}.${PROJECT_EXTENSION}`
}

const getRecentProjects = (settings = readJsonFile(getSettingsPath(), () => DEFAULT_SETTINGS)) =>
  [...new Set((settings?.recentProjects || []).filter(Boolean))]
    .filter((filePath) => fs.existsSync(filePath))
    .slice(0, MAX_RECENT_PROJECTS)
    .map((filePath) => ({
      path: filePath,
      name: getProjectNameFromPath(filePath)
    }))

const rememberRecentProject = (filePath) => {
  const normalizedPath = normalizeProjectFilePath(filePath)
  if (!normalizedPath) return getRecentProjects()

  const currentSettings = readJsonFile(getSettingsPath(), () => DEFAULT_SETTINGS)
  const nextSettings = {
    ...currentSettings,
    recentProjects: [
      normalizedPath,
      ...(currentSettings.recentProjects || []).filter((item) => item !== normalizedPath)
    ].slice(0, MAX_RECENT_PROJECTS)
  }

  writeJsonFile(getSettingsPath(), nextSettings)
  return getRecentProjects(nextSettings)
}

const collectFontsFromDirectory = (directoryPath) => {
  if (!directoryPath || !fs.existsSync(directoryPath)) return []

  try {
    return fs
      .readdirSync(directoryPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => normalizeFontName(entry.name))
      .filter((fontName) => fontName && hasLetters(fontName))
  } catch (error) {
    console.error(`Failed to read fonts from: ${directoryPath}`, error)
    return []
  }
}

const readWindowsRegistryFonts = () => {
  const registryKeys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
    'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'
  ]
  const registryExecutable = getWindowsRegistryPath()
  const fonts = new Set()

  if (!fs.existsSync(registryExecutable)) {
    return []
  }

  registryKeys.forEach((registryKey) => {
    try {
      const output = execFileSync(registryExecutable, ['query', registryKey], {
        encoding: 'utf-8',
        windowsHide: true,
        timeout: 3000,
        maxBuffer: 10 * 1024 * 1024
      })

      output
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.includes('REG_'))
        .forEach((line) => {
          const match = line.match(/^(.*?)\s+REG_\w+\s+.+$/u)
          const displayName = cleanupFontDisplayName(match?.[1] || '')
          if (!displayName || !hasLetters(displayName)) return
          fonts.add(displayName)
        })
    } catch (error) {
      console.error(`Failed to query Windows fonts registry: ${registryKey}`, error)
    }
  })

  return [...fonts]
}

let cachedSystemFonts = null

const getSystemFonts = () => {
  if (cachedSystemFonts) return cachedSystemFonts

  if (process.platform === 'win32') {
    const registryFonts = readWindowsRegistryFonts()
    if (registryFonts.length) {
      cachedSystemFonts = uniqueFontList(registryFonts)
      return cachedSystemFonts
    }
  }

  const fontDirectories = []

  if (process.platform === 'win32') {
    fontDirectories.push(join(process.env.WINDIR || 'C:\\Windows', 'Fonts'))
  } else if (process.platform === 'darwin') {
    fontDirectories.push(
      '/System/Library/Fonts',
      '/Library/Fonts',
      join(app.getPath('home'), 'Library', 'Fonts')
    )
  } else {
    fontDirectories.push(
      '/usr/share/fonts',
      '/usr/local/share/fonts',
      join(app.getPath('home'), '.fonts')
    )
  }

  cachedSystemFonts = uniqueFontList([
    'Arial',
    'Calibri',
    'Courier New',
    'Georgia',
    'Inter',
    'Roboto',
    'Segoe UI',
    'Tahoma',
    'Times New Roman',
    'Verdana',
    ...fontDirectories.flatMap((directoryPath) => collectFontsFromDirectory(directoryPath))
  ])
  return cachedSystemFonts
}

const getAppInfo = () => {
  const config = {
    ...getDefaultConfig(),
    ...(readOptionalJsonFile(getBundledConfigPath()) || {})
  }

  return {
    name: config.name || APP_NAME,
    version: config.version || app.getVersion(),
    links: config.links?.length ? config.links : DEFAULT_LINKS
  }
}

const getBootstrapData = () => {
  const initialProjectPath = pendingOpenPath
  pendingOpenPath = null

  return {
    settings: readJsonFile(getSettingsPath(), () => DEFAULT_SETTINGS),
    appInfo: getAppInfo(),
    systemFonts: getSystemFonts(),
    recentProjects: getRecentProjects(),
    initialProjectPath
  }
}

const shouldPromptToSaveProject = () => projectCloseState.dirty && projectCloseState.hasContent

const closeWindowWithApproval = (targetWindow) => {
  allowWindowClose = true
  targetWindow.close()
}

const attachCloseHandler = (targetWindow) => {
  targetWindow.on('close', (event) => {
    if (allowWindowClose) return
    if (!shouldPromptToSaveProject()) return

    event.preventDefault()

    const action = dialog.showMessageBoxSync(targetWindow, {
      type: 'question',
      buttons: ['Сохранить', 'Не сохранять', 'Отмена'],
      defaultId: 0,
      cancelId: 2,
      title: APP_NAME,
      message: 'Сохранить проект перед выходом?',
      detail: 'Если закрыть окно сейчас, изменения будут потеряны.'
    })

    if (action === 0) {
      targetWindow.webContents.send('app-close-requested')
      return
    }

    if (action === 1) {
      closeWindowWithApproval(targetWindow)
    }
  })

  targetWindow.on('closed', () => {
    allowWindowClose = false
    if (mainWindow === targetWindow) {
      mainWindow = null
    }
  })
}

function createWindow() {
  allowWindowClose = false
  mainWindow = new BrowserWindow({
    width: 1245,
    height: 880,
    minWidth: 720,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  attachCloseHandler(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (mainWindow?.webContents && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('open-file-path', filePath)
  } else {
    pendingOpenPath = filePath
  }
})
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_, argv) => {
    const filePath = extractProjectPathFromArgv(argv)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      if (filePath) mainWindow.webContents.send('open-file-path', filePath)
    } else if (filePath) {
      pendingOpenPath = filePath
    }
  })
  pendingOpenPath = extractProjectPathFromArgv(process.argv.slice(1)) || pendingOpenPath

  app.whenReady().then(() => {
    ensureStorage()
    registerWindowsFileAssociation()
    readJsonFile(getSettingsPath(), () => DEFAULT_SETTINGS)

  electronApp.setAppUserModelId('com.raytolfas.designer')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('save-image', async (event, payload) => {
    const format = EXPORT_FORMATS[payload?.format] ? payload.format : 'png'
    const bytes =
      typeof payload === 'object' && payload?.bytes
        ? payload.bytes
        : typeof payload === 'string'
          ? payload
          : null

    const buffer =
      bytes instanceof Uint8Array
        ? Buffer.from(bytes)
        : Array.isArray(bytes)
          ? Buffer.from(bytes)
          : typeof bytes === 'string'
            ? Buffer.from(bytes.replace(/^data:image\/\w+;base64,/, ''), 'base64')
            : null

    if (!buffer?.length) {
      return { saved: false, canceled: false, error: 'Missing image data.' }
    }
    const ext = EXPORT_FORMATS[format].ext
    const filters = [
      {
        name: EXPORT_FORMATS[format].label,
        extensions: format === 'jpeg' ? ['jpg', 'jpeg'] : [ext]
      }
    ]

    const win =
      (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) ||
      BrowserWindow.getFocusedWindow() ||
      mainWindow

    try {
      const file = await dialog.showSaveDialog(win, {
        title: 'Экспорт изображения',
        defaultPath: `design-${Date.now()}.${ext}`,
        filters
      })

      if (file.canceled || !file.filePath) {
        return { saved: false, canceled: true }
      }

      await fs.promises.writeFile(file.filePath, buffer)
      return { saved: true, canceled: false, filePath: file.filePath }
    } catch (error) {
      console.error('Failed to export image:', error)
      return { saved: false, canceled: false, error: error.message }
    }
  })

  ipcMain.handle('save-project', async (event, payload) => {
    const win =
      (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) ||
      BrowserWindow.getFocusedWindow() ||
      mainWindow
    const jsonString = typeof payload === 'string' ? payload : payload?.jsonString
    const currentFilePath = typeof payload === 'object' ? payload?.filePath : null

    if (!jsonString) {
      return { saved: false, canceled: true }
    }

    const writeProjectFile = async (filePath) => {
      const normalizedPath = normalizeProjectFilePath(filePath)
      await fs.promises.writeFile(normalizedPath, jsonString, 'utf-8')

      return {
        saved: true,
        canceled: false,
        filePath: normalizedPath,
        projectName: getProjectNameFromPath(normalizedPath),
        recentProjects: rememberRecentProject(normalizedPath)
      }
    }

    if (currentFilePath) {
      try {
        return await writeProjectFile(currentFilePath)
      } catch (error) {
        console.error(error)
        return { saved: false, canceled: true, error: error.message }
      }
    }

    try {
      const file = await dialog.showSaveDialog(win, {
        title: 'Сохранить проект Raytolfas',
        defaultPath: `project.${PROJECT_EXTENSION}`,
        filters: [{ name: 'Raytolfas Design', extensions: [PROJECT_EXTENSION] }]
      })

      if (file.canceled || !file.filePath) {
        return { saved: false, canceled: true }
      }

      return await writeProjectFile(file.filePath)
    } catch (error) {
      console.error(error)
      return { saved: false, canceled: true, error: error.message }
    }
  })

  ipcMain.handle('open-project', async (event, requestedPath) => {
    const win =
      (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) ||
      BrowserWindow.getFocusedWindow() ||
      mainWindow
    let targetPath =
      typeof requestedPath === 'string'
        ? requestedPath
        : typeof requestedPath === 'object'
          ? requestedPath?.filePath
          : null

    if (!targetPath) {
      const result = await dialog.showOpenDialog(win, {
        title: 'Открыть проект',
        filters: [{ name: 'Raytolfas Design', extensions: [PROJECT_EXTENSION] }],
        properties: ['openFile']
      })

      if (result.canceled || !result.filePaths?.[0]) return null
      targetPath = result.filePaths[0]
    }

    if (!fs.existsSync(targetPath)) return null

    try {
      const content = await fs.promises.readFile(targetPath, 'utf-8')
      return {
        content,
        filePath: targetPath,
        projectName: getProjectNameFromPath(targetPath),
        recentProjects: rememberRecentProject(targetPath)
      }
    } catch (error) {
      console.error(`Failed to read project file: ${targetPath}`, error)
      return null
    }
  })

  const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024

  ipcMain.handle('open-file', async (event) => {
    const win =
      (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) ||
      BrowserWindow.getFocusedWindow() ||
      mainWindow
    const result = await dialog.showOpenDialog(win, {
      title: 'Открыть файл',
      filters: [
        { name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: 'Все файлы', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || !result.filePaths?.[0]) return null

    const filePath = result.filePaths[0]

    const stat = fs.statSync(filePath)
    if (stat.size > MAX_IMAGE_SIZE_BYTES) {
      dialog.showMessageBoxSync(win, {
        type: 'warning',
        title: APP_NAME,
        message: 'Файл слишком большой',
        detail: `Максимальный размер изображения — 20 МБ. Выбранный файл: ${(stat.size / 1024 / 1024).toFixed(1)} МБ.`
      })
      return null
    }

    const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
    const mime = { jpg: 'jpeg', jpeg: 'jpeg', gif: 'gif', webp: 'webp', png: 'png' }[ext] || 'png'
    const buffer = await fs.promises.readFile(filePath)
    return { base64: buffer.toString('base64'), mime: `image/${mime}` }
  })

  ipcMain.handle('save-style-file', async (event, payload) => {
    const win =
      (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) ||
      BrowserWindow.getFocusedWindow() ||
      mainWindow
    const jsonString = typeof payload === 'string' ? payload : payload?.jsonString
    const styleName = typeof payload === 'object' ? payload?.name : 'style'

    if (!jsonString) {
      return { saved: false, canceled: true }
    }

    try {
      const file = await dialog.showSaveDialog(win, {
        title: 'Сохранить стиль',
        defaultPath: `${styleName || 'style'}.${STYLE_EXTENSION}`,
        filters: [{ name: 'Raytolfas Text Style', extensions: [STYLE_EXTENSION] }]
      })

      if (file.canceled || !file.filePath) {
        return { saved: false, canceled: true }
      }

      await fs.promises.writeFile(file.filePath, jsonString, 'utf-8')
      return { saved: true, canceled: false, filePath: file.filePath }
    } catch (error) {
      console.error(error)
      return { saved: false, canceled: true, error: error.message }
    }
  })

  ipcMain.handle('open-style-file', async (event) => {
    const win =
      (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) ||
      BrowserWindow.getFocusedWindow() ||
      mainWindow
    const result = await dialog.showOpenDialog(win, {
      title: 'Открыть стиль',
      filters: [{ name: 'Raytolfas Text Style', extensions: [STYLE_EXTENSION] }],
      properties: ['openFile']
    })

    if (result.canceled || !result.filePaths?.[0]) return null

    try {
      const content = await fs.promises.readFile(result.filePaths[0], 'utf-8')
      return {
        content,
        filePath: result.filePaths[0]
      }
    } catch (error) {
      console.error('Failed to read style file:', error)
      return null
    }
  })

  ipcMain.handle('get-bootstrap-data', async () => getBootstrapData())

  let cachedOrtSession = null
  const getModelPath = () => {
    const prodPath = join(process.resourcesPath, 'resources', 'models', 'u2netp.onnx')
    if (fs.existsSync(prodPath)) return prodPath
    const prodPathAlt = join(process.resourcesPath, 'models', 'u2netp.onnx')
    if (fs.existsSync(prodPathAlt)) return prodPathAlt
    const devPath = join(__dirname, '../../resources/models/u2netp.onnx')
    if (fs.existsSync(devPath)) return devPath
    const localPath = join(app.getAppPath(), 'resources', 'models', 'u2netp.onnx')
    if (fs.existsSync(localPath)) return localPath
    return devPath
  }

  ipcMain.handle('remove-background', async (event, payload) => {
    try {
      const tensorData = payload?.tensorData || payload
      if (!tensorData) throw new Error('Missing input tensor data')

      if (!cachedOrtSession) {
        const ort = require('onnxruntime-web')
        const modelPath = getModelPath()
        if (!fs.existsSync(modelPath)) {
          throw new Error(`Model file not found at ${modelPath}`)
        }
        const modelBuffer = await fs.promises.readFile(modelPath)
        cachedOrtSession = await ort.InferenceSession.create(modelBuffer, {
          executionProviders: ['wasm']
        })
      }

      const ort = require('onnxruntime-web')
      const floatArray =
        tensorData instanceof Float32Array ? tensorData : new Float32Array(tensorData)
      const tensor = new ort.Tensor('float32', floatArray, [1, 3, 320, 320])
      const inputName = cachedOrtSession.inputNames[0] || 'input.1'
      const results = await cachedOrtSession.run({ [inputName]: tensor })
      const outputName = cachedOrtSession.outputNames[0] || '1959'
      const maskTensor = results[outputName]

      return {
        success: true,
        maskData: Array.from(maskTensor.data)
      }
    } catch (error) {
      console.error('Failed to remove background:', error)
      return {
        success: false,
        error: error.message
      }
    }
  })

  ipcMain.handle('save-settings', async (event, nextSettings) => {
    const currentSettings = readJsonFile(getSettingsPath(), () => DEFAULT_SETTINGS)
    const { recentProjects: _ignored, ...safeNextSettings } = nextSettings || {}
    const mergedSettings = {
      ...currentSettings,
      ...safeNextSettings,
      recentProjects: currentSettings.recentProjects || []
    }

    writeJsonFile(getSettingsPath(), mergedSettings)
    return mergedSettings
  })

  ipcMain.on('project-state-changed', (event, nextState) => {
    projectCloseState = {
      dirty: Boolean(nextState?.dirty),
      hasContent: Boolean(nextState?.hasContent)
    }
  })

  ipcMain.on('confirm-app-close', (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender)
    if (!targetWindow) return
    closeWindowWithApproval(targetWindow)
  })

  ipcMain.on('cancel-app-close', () => {
    allowWindowClose = false
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
