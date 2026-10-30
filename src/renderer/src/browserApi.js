import * as ort from 'onnxruntime-web'

const STORAGE_KEY_SETTINGS = 'raytolfas_settings'
const STORAGE_KEY_RECENT = 'raytolfas_recent_projects'

let cachedWebOrtSession = null

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a)
    URL.revokeObjectURL(url)
  }, 1000)
}

function getWebRecentProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECENT)
    if (raw) {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    }
  } catch (err) {
    console.error(err)
  }
  return []
}

function updateWebRecentProjects(item) {
  try {
    const current = getWebRecentProjects()
    const next = [item, ...current.filter((x) => x.name !== item.name && x.path !== item.path)].slice(0, 20)
    localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(next))
    return next
  } catch (err) {
    console.error(err)
    return []
  }
}

export const browserApi = {
  isWeb: true,

  getBootstrapData: async () => {
    let settings = null
    try {
      const rawSettings = localStorage.getItem(STORAGE_KEY_SETTINGS)
      if (rawSettings) settings = JSON.parse(rawSettings)
    } catch (err) {
      console.error(err)
    }

    return {
      settings,
      appInfo: {
        name: 'Raytolfas Designer',
        version: '1.0.0',
        links: [
          { label: 'Website', url: 'https://designer.raytolfas.com' },
          { label: 'Raytolfas', url: 'https://raytolfas.com' },
          { label: 'GitHub', url: 'https://github.com/Raytolfas/Designer' }
        ]
      },
      systemFonts: [],
      recentProjects: getWebRecentProjects(),
      initialProjectPath: null
    }
  },

  saveSettings: async (nextSettings) => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(nextSettings))
    } catch (err) {
      console.error(err)
    }
    return { success: true }
  },

  openFile: () => {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.style.display = 'none'
      input.onchange = (e) => {
        const file = e.target.files?.[0]
        if (!file) {
          resolve({ canceled: true })
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result
          const commaIndex = result.indexOf(',')
          const base64 = commaIndex !== -1 ? result.slice(commaIndex + 1) : result
          resolve({
            name: file.name,
            mime: file.type || 'image/png',
            base64
          })
        }
        reader.onerror = (err) => reject(err)
        reader.readAsDataURL(file)
      }
      document.body.appendChild(input)
      input.click()
      setTimeout(() => {
        if (input.parentNode) input.parentNode.removeChild(input)
      }, 1000)
    })
  },

  openProject: () => {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.rdesign,application/json'
      input.style.display = 'none'
      input.onchange = (e) => {
        const file = e.target.files?.[0]
        if (!file) {
          resolve({ canceled: true })
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          try {
            const projectData = JSON.parse(reader.result)
            const projectName = file.name.replace(/\.rdesign$/i, '')
            updateWebRecentProjects({ name: projectName, path: file.name })
            resolve({
              filePath: file.name,
              projectName,
              projectData
            })
          } catch (err) {
            reject(err)
          }
        }
        reader.onerror = (err) => reject(err)
        reader.readAsText(file)
      }
      document.body.appendChild(input)
      input.click()
      setTimeout(() => {
        if (input.parentNode) input.parentNode.removeChild(input)
      }, 1000)
    })
  },

  saveProject: async ({ defaultPath = 'project.rdesign', projectData }) => {
    const filename = defaultPath.endsWith('.rdesign') ? defaultPath : `${defaultPath}.rdesign`
    const json = typeof projectData === 'string' ? projectData : JSON.stringify(projectData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    downloadBlob(blob, filename)
    const projectName = filename.replace(/\.rdesign$/i, '')
    const recent = updateWebRecentProjects({ name: projectName, path: filename })
    return {
      saved: true,
      filePath: filename,
      projectName,
      recentProjects: recent
    }
  },

  saveExport: async ({ defaultPath, buffer, format }) => {
    const mimeMap = {
      png: 'image/png',
      jpeg: 'image/jpeg',
      jpg: 'image/jpeg',
      svg: 'image/svg+xml',
      pdf: 'application/pdf'
    }
    const mime = mimeMap[format] || 'application/octet-stream'
    const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    const blob = new Blob([uint8], { type: mime })
    downloadBlob(blob, defaultPath)
    return { saved: true, filePath: defaultPath }
  },

  saveStyleFile: async ({ name, jsonString }) => {
    const fileName = `${name || 'style'}.rdtxt`
    const blob = new Blob([jsonString], { type: 'text/plain' })
    downloadBlob(blob, fileName)
    return { saved: true, filePath: fileName }
  },

  openStyleFile: () => {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.rdtxt,text/plain,application/json'
      input.style.display = 'none'
      input.onchange = (e) => {
        const file = e.target.files?.[0]
        if (!file) {
          resolve({ canceled: true })
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          resolve({
            name: file.name,
            jsonString: reader.result
          })
        }
        reader.onerror = (err) => reject(err)
        reader.readAsText(file)
      }
      document.body.appendChild(input)
      input.click()
      setTimeout(() => {
        if (input.parentNode) input.parentNode.removeChild(input)
      }, 1000)
    })
  },

  getPathForFile: (file) => file?.name || '',
  cancelAppClose: () => {},
  confirmAppClose: () => {},

  removeBackground: async ({ tensorData }) => {
    try {
      if (!cachedWebOrtSession) {
        if (ort.env?.wasm) {
          ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/'
        }
        let modelBuffer
        try {
          const modelUrl = new URL('./models/u2netp.onnx', window.location.href).href
          const res = await fetch(modelUrl)
          if (!res.ok) throw new Error()
          modelBuffer = await res.arrayBuffer()
        } catch {
          const fallbackRes = await fetch('models/u2netp.onnx')
          if (!fallbackRes.ok) {
            throw new Error('Failed to load ONNX model file')
          }
          modelBuffer = await fallbackRes.arrayBuffer()
        }
        cachedWebOrtSession = await ort.InferenceSession.create(modelBuffer, {
          executionProviders: ['wasm']
        })
      }

      const floatArray =
        tensorData instanceof Float32Array ? tensorData : new Float32Array(tensorData)
      const tensor = new ort.Tensor('float32', floatArray, [1, 3, 320, 320])
      const inputName = cachedWebOrtSession.inputNames[0] || 'input.1'
      const results = await cachedWebOrtSession.run({ [inputName]: tensor })
      const outputName = cachedWebOrtSession.outputNames[0] || '1959'
      const maskTensor = results[outputName]

      return {
        success: true,
        maskData: Array.from(maskTensor.data)
      }
    } catch (err) {
      console.error(err)
      return {
        success: false,
        error: err.message
      }
    }
  }
}
