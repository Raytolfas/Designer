import { useCallback, useEffect, useRef, useState } from 'react'
import * as fabric from 'fabric'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Box,
  ChevronDown,
  ChevronRight,
  Circle,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FilePlus,
  FolderOpen,
  GripVertical,
  Image,
  Info,
  Lock,
  Maximize2,
  Minus,
  MousePointer2,
  MoveLeft,
  PaintBucket,
  Pencil,
  Plus,
  Redo2,
  RefreshCcw,
  Save,
  Settings,
  Shapes,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  Unlock,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import appIcon from '../../../resources/icon.png'
import ImageTracer from './imageTracer'
import { getTranslation, SUPPORTED_LANGUAGES } from './i18n'
import './App.css'

const DEFAULT_SIZE = { w: 1080, h: 1080 }
const DEFAULT_ZOOM = 0.5
const HISTORY_LIMIT = 50
const TEXT_TYPES = new Set(['i-text', 'textbox', 'text'])
const STROKE_ONLY_TYPES = new Set(['line', 'path', 'polyline'])
const RECOMMENDED_FONTS = [
  'Inter',
  'Segoe UI',
  'Arial',
  'Roboto',
  'Georgia',
  'Verdana',
  'Trebuchet MS',
  'Times New Roman',
  'Courier New'
]
const DEFAULT_LINKS = [
  { label: 'Website', url: 'https://designer.raytolfas.com' },
  { label: 'Raytolfas', url: 'https://raytolfas.com' },
  { label: 'GitHub', url: 'https://github.com/Raytolfas/Designer' }
]
const DEFAULT_SETTINGS = {
  language: 'en',
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
  stylePresets: []
}
const DEFAULT_APP_INFO = {
  name: 'Raytolfas Designer',
  version: '1.0.0',
  links: DEFAULT_LINKS
}
const DEFAULT_FONT_SECTIONS = {
  recent: true,
  recommended: true,
  system: false
}
const DEFAULT_EFFECTS = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  noise: 0,
  tint: '#ffffff',
  tintAlpha: 0
}
const BRUSH_TYPE_OPTIONS = [
  { value: 'standard', labelKey: 'brush.standard' },
  { value: 'soft', labelKey: 'brush.soft' },
  { value: 'custom', labelKey: 'brush.custom' }
]
const PRESET_SIZES = {
  custom: null,
  ytThumb: { width: 1280, height: 720 },
  igPost: { width: 1080, height: 1080 },
  igStory: { width: 1080, height: 1920 },
  tgBanner: { width: 1200, height: 800 },
  marketplace: { width: 900, height: 1200 },
  fullHd: { width: 1920, height: 1080 },
  printA4: { width: 2480, height: 3508 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  hd: { width: 1920, height: 1080 },
  a4: { width: 2480, height: 3508 }
}
const DEFAULT_PROJECT = {
  path: '',
  name: 'Untitled'
}
const CUSTOM_SERIALIZATION_FIELDS = [
  'id',
  'name',
  'globalCompositeOperation',
  'customEffects',
  'customStyleId',
  'locked'
]
const BLEND_MODE_OPTIONS = [
  { value: 'source-over', label: 'Normal' },
  { value: 'screen', label: 'Screen' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'darken', label: 'Darken' }
]
const SETTINGS_SECTIONS = [
  { key: 'general' },
  { key: 'canvas' },
  { key: 'snapping' },
  { key: 'interface' },
  { key: 'fonts' },
  { key: 'language' },
  { key: 'about' }
]

const createObjectId = () =>
  globalThis.crypto?.randomUUID?.() ?? `obj_${Math.random().toString(36).slice(2, 11)}`

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const createProjectDraft = () => ({
  name: DEFAULT_PROJECT.name,
  width: DEFAULT_SIZE.w,
  height: DEFAULT_SIZE.h,
  preset: 'custom',
  backgroundColor: '#ffffff',
  transparentBackground: false,
  showGrid: false
})

const normalizeSize = (value = DEFAULT_SIZE) => ({
  w: Math.max(1, Number.parseInt(value.w, 10) || DEFAULT_SIZE.w),
  h: Math.max(1, Number.parseInt(value.h, 10) || DEFAULT_SIZE.h)
})

const getObjectType = (object) => object?.type?.toLowerCase?.() || ''
const isTextObject = (object) => TEXT_TYPES.has(getObjectType(object))
const isImageObject = (object) => getObjectType(object) === 'image'
const isActiveSelection = (object) =>
  Boolean(
    object &&
      (getObjectType(object) === 'activeselection' ||
        object instanceof fabric.ActiveSelection ||
        'multiSelectionStacking' in object)
  )
const isGroupObject = (object) =>
  Boolean(
    object &&
      (getObjectType(object) === 'group' ||
        (object instanceof fabric.Group && !isActiveSelection(object)))
  )

const applyLockState = (object, locked) => {
  object.set({
    locked,
    lockMovementX: locked,
    lockMovementY: locked,
    lockRotation: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    hasControls: !locked
  })
}

const assignFreshIds = (object) => {
  object.id = createObjectId()
  if (typeof object.getObjects === 'function') {
    object.getObjects().forEach(assignFreshIds)
  }
}

const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024
const NUDGE_STEP = 1
const NUDGE_STEP_FAST = 10
const MIN_ZOOM = 0.02
const MAX_ZOOM = 5
const VIEW_PADDING = 48
const FIT_PADDING = VIEW_PADDING * 2

const toInputColor = (value, fallback = '#A250FF') => {
  if (typeof value !== 'string') return fallback

  const hexMatch = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i)
  if (hexMatch) {
    if (value.length === 4) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
    }
    return value
  }

  const rgbMatch = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!rgbMatch) return fallback

  const [r, g, b] = rgbMatch
    .slice(1, 4)
    .map((part) => Number.parseInt(part, 10).toString(16).padStart(2, '0'))

  return `#${r}${g}${b}`
}

const uniqueFonts = (fonts) =>
  [...new Set((fonts || []).filter(Boolean))].sort((left, right) => left.localeCompare(right))

const shiftObjectByDelta = (object, deltaX = 0, deltaY = 0) => {
  if (!object || (!deltaX && !deltaY)) return

  const center = object.getCenterPoint()
  object.setPositionByOrigin(
    new fabric.Point(center.x + deltaX, center.y + deltaY),
    'center',
    'center'
  )
  object.setCoords?.()
}

const createSeededRandom = (seed) => {
  let state = Math.abs(Number.parseInt(seed, 10) || 1) % 2147483647
  if (state <= 0) state += 2147483646

  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

const withBrushAlpha = (color, opacity = 100) =>
  new fabric.Color(color).setAlpha(clamp((opacity || 100) / 100, 0.02, 1)).toRgba()

const createSoftBrush = (canvas, color, width) => {
  const brush = new fabric.PencilBrush(canvas)
  const baseColor = new fabric.Color(color)

  brush.color = color
  brush.width = Math.max(2, width * 1.2)
  brush.decimate = 2
  brush.strokeLineCap = 'round'
  brush.strokeLineJoin = 'round'
  brush.shadow = new fabric.Shadow({
    color: baseColor.setAlpha(0.22).toRgba(),
    blur: Math.max(4, width * 1.6),
    offsetX: 0,
    offsetY: 0
  })

  return brush
}

const createCustomBrush = (canvas, color, width, seed) => {
  const brush = new fabric.CircleBrush(canvas)

  brush.width = Math.max(6, width * 2.2)
  brush.color = color
  brush.shadow = new fabric.Shadow({
    color: new fabric.Color(color).setAlpha(0.15).toRgba(),
    blur: Math.max(2, width * 0.7),
    offsetX: 0,
    offsetY: 0
  })
  let strokeRandom = createSeededRandom(seed)
  const originalOnMouseDown = brush.onMouseDown?.bind(brush)
  brush.onMouseDown = (...args) => {
    strokeRandom = createSeededRandom(seed + Date.now() % 9999)
    return originalOnMouseDown?.(...args)
  }

  brush.needsFullRender = () => true
  brush.addPoint = ({ x, y }) => {
    const r = strokeRandom()
    const point = {
      x,
      y,
      radius: Math.max(0.8, width * (0.25 + r * 0.5)),
      fill: new fabric.Color(color).setAlpha(clamp(0.2 + strokeRandom() * 0.4, 0.15, 0.65)).toRgba()
    }
    brush.points.push(point)
    return point
  }

  return brush
}

const createConfiguredBrush = (canvas, { type, color, size, opacity, seed, smoothing }) => {
  const width = Math.max(1, Number.parseFloat(size) || 1)
  const rgbaColor = withBrushAlpha(color, opacity)
  const decimate = Math.max(1, Math.round(8 - (clamp(smoothing ?? 50, 0, 100) / 100) * 7))

  if (type === 'soft') {
    const brush = createSoftBrush(canvas, rgbaColor, width)
    brush.decimate = decimate
    return brush
  }

  if (type === 'custom') {
    return createCustomBrush(canvas, rgbaColor, width, seed)
  }
  const brush = new fabric.PencilBrush(canvas)
  brush.color = rgbaColor
  brush.width = width
  brush.decimate = decimate
  brush.strokeLineCap = 'round'
  brush.strokeLineJoin = 'round'
  return brush
}

const applyColorToObject = (object, color) => {
  if (!object) return false

  if (isActiveSelection(object)) {
    return object.getObjects().some((item) => applyColorToObject(item, color))
  }

  if (isGroupObject(object) && Array.isArray(object._objects)) {
    return object._objects.some((item) => applyColorToObject(item, color))
  }

  if (STROKE_ONLY_TYPES.has(getObjectType(object)) && 'stroke' in object) {
    if (object.stroke === color) return false
    object.set('stroke', color)
    return true
  }

  if ('fill' in object) {
    if (object.fill === color) return false
    object.set('fill', color)
    return true
  }

  if ('stroke' in object) {
    if (object.stroke === color) return false
    object.set('stroke', color)
    return true
  }

  return false
}

const getObjectMetrics = (object) => {
  const bounds = object.getBoundingRect()
  const center = object.getCenterPoint()

  return {
    left: bounds.left,
    right: bounds.left + bounds.width,
    top: bounds.top,
    bottom: bounds.top + bounds.height,
    centerX: center.x,
    centerY: center.y
  }
}

const isPointNearObject = (object, point) => {
  if (!object?.visible) return false
  if (object.containsPoint?.(point)) return true

  const bounds = object.getBoundingRect()
  const padding = Math.max(6, object.strokeWidth || 0)

  return (
    point.x >= bounds.left - padding &&
    point.x <= bounds.left + bounds.width + padding &&
    point.y >= bounds.top - padding &&
    point.y <= bounds.top + bounds.height + padding
  )
}

const findFillTarget = (canvas, event) => {
  const point = canvas.getScenePoint(event)
  const objects = canvas.getObjects().slice().reverse()
  return objects.find((object) => isPointNearObject(object, point)) || null
}

const updateRecentFonts = (recentFonts, nextFont) =>
  [nextFont, ...(recentFonts || []).filter((font) => font !== nextFont)].slice(0, 8)

const normalizeEffects = (value = {}) => ({
  ...DEFAULT_EFFECTS,
  ...(value || {})
})

const buildImageFilters = (effects) => {
  const normalized = normalizeEffects(effects)
  const filters = []

  if (normalized.brightness) {
    filters.push(new fabric.filters.Brightness({ brightness: normalized.brightness / 100 }))
  }

  if (normalized.contrast) {
    filters.push(new fabric.filters.Contrast({ contrast: normalized.contrast / 100 }))
  }

  if (normalized.saturation) {
    filters.push(new fabric.filters.Saturation({ saturation: normalized.saturation / 100 }))
  }

  if (normalized.blur) {
    filters.push(new fabric.filters.Blur({ blur: normalized.blur / 100 }))
  }

  if (normalized.noise) {
    filters.push(new fabric.filters.Noise({ noise: normalized.noise * 4 }))
  }

  if (normalized.tintAlpha > 0) {
    filters.push(
      new fabric.filters.BlendColor({
        color: normalized.tint,
        alpha: normalized.tintAlpha / 100,
        mode: 'tint'
      })
    )
  }

  return filters
}

const getProjectNameFromPath = (filePath) =>
  filePath
    ?.split(/[\\/]/u)
    .pop()
    ?.replace(/\.[^.]+$/u, '') || DEFAULT_PROJECT.name

const dataUrlToBytes = (dataUrl) => {
  const [, base64 = ''] = dataUrl.split(',')
  const binary = globalThis.atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

const EMPTY_CANVAS_SNAPSHOT = JSON.stringify({ objects: [] })

const createTabId = () => `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const buildPdfFromJpeg = (jpegBytes, pixelWidth, pixelHeight) => {
  const encoder = new TextEncoder()
  const pageWidth = (pixelWidth * 0.75).toFixed(2)
  const pageHeight = (pixelHeight * 0.75).toFixed(2)
  const chunks = []
  const offsets = []
  let length = 0

  const push = (data) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data
    chunks.push(bytes)
    length += bytes.length
  }
  const startObject = (number) => {
    offsets[number] = length
    push(`${number} 0 obj\n`)
  }

  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`

  push('%PDF-1.4\n')
  startObject(1)
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  startObject(2)
  push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  startObject(3)
  push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`
  )
  startObject(4)
  push(
    `<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  )
  push(jpegBytes)
  push('\nendstream\nendobj\n')
  startObject(5)
  push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`)

  const xrefOffset = length
  let xref = 'xref\n0 6\n0000000000 65535 f \n'
  for (let number = 1; number <= 5; number += 1) {
    xref += `${String(offsets[number]).padStart(10, '0')} 00000 n \n`
  }
  push(xref)
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)

  const result = new Uint8Array(length)
  let position = 0
  chunks.forEach((chunk) => {
    result.set(chunk, position)
    position += chunk.length
  })
  return result
}

function App() {
  const canvasRef = useRef(null)
  const fabricCanvas = useRef(null)
  const zoomRef = useRef(DEFAULT_ZOOM)
  const pendingProjectRef = useRef(null)
  const dragLayerRef = useRef(null)
  const clipboardRef = useRef(null)
  const tabsRef = useRef([])
  const activeTabIdRef = useRef(null)
  const pendingDirtyRef = useRef(false)
  const pendingHistoryRef = useRef(null)
  const currentProjectRef = useRef(null)
  const openProjectRef = useRef(null)
  const viewportRef = useRef(null)
  const artboardRef = useRef(null)
  const spacePressedRef = useRef(false)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const viewOffsetRef = useRef({ x: 0, y: 0 })
  const guideLinesRef = useRef([])
  const historyRef = useRef({ past: [], current: null, future: [] })
  const isRestoringRef = useRef(false)
  const historyTimeoutRef = useRef(null)
  const batchMutationRef = useRef(false)
  const bootstrapReadyRef = useRef(false)
  const projectStateRef = useRef({ dirty: false, hasContent: false })
  const projectAppearanceRef = useRef({
    backgroundColor: '#ffffff',
    transparentBackground: false
  })
  const snapSettingsRef = useRef({
    enabled: DEFAULT_SETTINGS.snapEnabled,
    tolerance: DEFAULT_SETTINGS.snapTolerance
  })
  const snapLocksRef = useRef({ x: null, y: null })
  const fontMenuRef = useRef(null)
  const fontMenuButtonRef = useRef(null)
  const brushSettingsRef = useRef(null)
  const brushSettingsButtonRef = useRef(null)
  const resizeStateRef = useRef(null)
  const floatingPanelRef = useRef(null)
  const floatingPanelButtonRef = useRef(null)
  const activeToolRef = useRef('select')
  const lastSelectedLayerIndexRef = useRef(null)

  const [init, setInit] = useState(false)
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [draftSize, setDraftSize] = useState(DEFAULT_SIZE)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [tabs, setTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(null)
  const [layers, setLayers] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [selectedObjectIds, setSelectedObjectIds] = useState([])
  const [editingLayerId, setEditingLayerId] = useState(null)
  const [editingLayerName, setEditingLayerName] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuView, setMenuView] = useState('main')
  const [dragLayerId, setDragLayerId] = useState(null)
  const [dropIndex, setDropIndex] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeTool, setActiveTool] = useState('select')
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 })
  const [brushColor, setBrushColor] = useState(DEFAULT_SETTINGS.defaultColor)
  const [settingsState, setSettingsState] = useState(DEFAULT_SETTINGS)
  const [fontPickerOpen, setFontPickerOpen] = useState(false)
  const [brushSettingsOpen, setBrushSettingsOpen] = useState(false)
  const [fontSections, setFontSections] = useState(DEFAULT_FONT_SECTIONS)
  const [fontSearch, setFontSearch] = useState('')
  const [systemFonts, setSystemFonts] = useState(RECOMMENDED_FONTS)
  const [appInfo, setAppInfo] = useState(DEFAULT_APP_INFO)
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [currentProject, setCurrentProject] = useState(DEFAULT_PROJECT)
  const [recentProjects, setRecentProjects] = useState([])
  const [projectStatus, setProjectStatus] = useState({ dirty: false, hasContent: false })
  const [settingsCategory, setSettingsCategory] = useState('general')
  const [projectSetupOpen, setProjectSetupOpen] = useState(false)
  const [projectDraft, setProjectDraft] = useState(createProjectDraft())
  const [floatingPanelOpen, setFloatingPanelOpen] = useState(false)
  const [floatingPanelTab, setFloatingPanelTab] = useState('styles')
  const [layerContextMenu, setLayerContextMenu] = useState(null)
  const [styleNameDraft, setStyleNameDraft] = useState('New Style')
  const [isRemovingBg, setIsRemovingBg] = useState(false)
  const [isVectorizing, setIsVectorizing] = useState(false)
  const currentLang = settingsState.language || 'en'
  const t = useCallback((key, params) => getTranslation(currentLang, key, params), [currentLang])

  zoomRef.current = zoom
  currentProjectRef.current = currentProject
  viewOffsetRef.current = viewOffset
  activeToolRef.current = activeTool

  const activeObject = fabricCanvas.current?.getActiveObject() || null
  const activeTextObject = isTextObject(activeObject) ? activeObject : null
  const activeSelectionObject = isActiveSelection(activeObject) ? activeObject : null
  const canGroupSelection = Boolean(
    activeSelectionObject?.getObjects?.().length > 1 || selectedObjectIds.length > 1
  )
  const activeBrushType =
    BRUSH_TYPE_OPTIONS.find((option) => option.value === settingsState.brushType) ||
    BRUSH_TYPE_OPTIONS[0]
  const recentFonts = settingsState.recentFonts
  const recommendedFonts = uniqueFonts(RECOMMENDED_FONTS)
  const allSystemFonts = uniqueFonts(systemFonts.length ? systemFonts : RECOMMENDED_FONTS)
  const normalizedFontSearch = fontSearch.trim().toLowerCase()

  const syncHistoryCounters = useCallback(() => {
    setHistoryState({
      undo: historyRef.current.past.length,
      redo: historyRef.current.future.length
    })
  }, [])

  const resetSnapLocks = useCallback((objectId = null) => {
    ;['x', 'y'].forEach((axis) => {
      const currentLock = snapLocksRef.current[axis]
      if (!objectId || currentLock?.objectId === objectId) {
        snapLocksRef.current[axis] = null
      }
    })
  }, [])

  const ensureObjectMeta = useCallback((object, index = 0) => {
    if (!object) return object

    if (!object.id) object.id = createObjectId()
    if (!object.name) {
      object.name = isGroupObject(object)
        ? `GROUP ${index + 1}`
        : `${object.type?.toUpperCase?.() || 'LAYER'} ${index + 1}`
    }

    if (typeof object.getObjects === 'function' && isGroupObject(object)) {
      object
        .getObjects()
        .forEach((childObject, childIndex) => ensureObjectMeta(childObject, childIndex))
    }

    return object
  }, [])

  const updateStore = useCallback(() => {
    const canvas = fabricCanvas.current
    if (!canvas) return

    const objects = canvas.getObjects().map((object, index) => {
      ensureObjectMeta(object, index)
      return {
        id: object.id,
        type: object.type,
        name: object.name,
        visible: object.visible !== false,
        locked: Boolean(object.locked),
        ref: object
      }
    })

    setLayers([...objects].reverse())

    const currentActiveObject = canvas.getActiveObject()
    setActiveId(
      isActiveSelection(currentActiveObject) ? null : (currentActiveObject?.id ?? null)
    )
    if (!currentActiveObject) {
      setSelectedObjectIds([])
    } else if (isActiveSelection(currentActiveObject)) {
      setSelectedObjectIds(currentActiveObject.getObjects().map((item) => item.id))
    } else {
      setSelectedObjectIds([currentActiveObject.id])
    }
  }, [ensureObjectMeta])

  const filterFonts = useCallback(
    (fonts, keepOrder = false) => {
      const normalizedFonts = keepOrder
        ? [...new Set((fonts || []).filter(Boolean))]
        : uniqueFonts(fonts)
      if (!normalizedFontSearch) return normalizedFonts
      return normalizedFonts.filter((fontName) =>
        fontName.toLowerCase().includes(normalizedFontSearch)
      )
    },
    [normalizedFontSearch]
  )

  const filteredRecentFonts = filterFonts(recentFonts, true)
  const filteredRecommendedFonts = filterFonts(recommendedFonts)
  const filteredSystemFonts = filterFonts(allSystemFonts)
  const sidebarWidth = clamp(Number.parseInt(settingsState.sidebarWidth, 10) || 320, 260, 520)
  const layerPanelHeight = clamp(
    Number.parseInt(settingsState.layerPanelHeight, 10) || 320,
    220,
    560
  )
  const fontMenuHeight = clamp(Number.parseInt(settingsState.fontMenuHeight, 10) || 360, 240, 720)
  const stylePresets = Array.isArray(settingsState.stylePresets) ? settingsState.stylePresets : []
  const activeEffects = normalizeEffects(activeObject?.customEffects)

  const syncProjectState = useCallback((nextState) => {
    const canvas = fabricCanvas.current
    const hasContent = nextState?.hasContent ?? Boolean(canvas?.getObjects().length)
    const dirty = nextState?.dirty ?? projectStateRef.current.dirty

    const resolvedState = { dirty, hasContent }
    projectStateRef.current = resolvedState
    setProjectStatus(resolvedState)
    const otherTabsDirty = tabsRef.current.some(
      (tab) => tab.id !== activeTabIdRef.current && tab.dirty
    )
    window.electronAPI?.setProjectState?.({
      dirty: dirty || otherTabsDirty,
      hasContent: hasContent || tabsRef.current.length > 1
    })
  }, [])

  const getCanvasSnapshot = useCallback(() => {
    const canvas = fabricCanvas.current
    return canvas ? JSON.stringify(canvas.toJSON(CUSTOM_SERIALIZATION_FIELDS)) : null
  }, [])

  const resetHistoryFromCanvas = useCallback(() => {
    historyRef.current = {
      past: [],
      current: getCanvasSnapshot(),
      future: []
    }
    syncHistoryCounters()
  }, [getCanvasSnapshot, syncHistoryCounters])

  const commitCanvasState = useCallback(() => {
    if (isRestoringRef.current) return

    const snapshot = getCanvasSnapshot()
    if (!snapshot) return

    const history = historyRef.current
    if (snapshot === history.current) {
      updateStore()
      return
    }

    if (history.current != null) {
      history.past.push(history.current)
      if (history.past.length > HISTORY_LIMIT) {
        history.past.shift()
      }
    }

    history.current = snapshot
    history.future = []
    syncHistoryCounters()
    updateStore()
    syncProjectState({ dirty: true })
  }, [getCanvasSnapshot, syncHistoryCounters, syncProjectState, updateStore])

  const queueHistoryCommit = useCallback(() => {
    if (historyTimeoutRef.current) {
      clearTimeout(historyTimeoutRef.current)
    }

    historyTimeoutRef.current = setTimeout(() => {
      historyTimeoutRef.current = null
      commitCanvasState()
    }, 120)
  }, [commitCanvasState])

  const applyEffectsToFabricObject = useCallback((object, nextEffects) => {
    if (!object) return
    const resolvedEffects = normalizeEffects(nextEffects)
    object.set('customEffects', resolvedEffects)

    if (isImageObject(object)) {
      object.filters = buildImageFilters(resolvedEffects)
      object.applyFilters?.()
      object.dirty = true
    }
  }, [])

  const hydrateCanvasObjects = useCallback(
    (canvasInstance) => {
      const isSelect = activeToolRef.current === 'select'
      const isFill = activeToolRef.current === 'fill'

      canvasInstance.getObjects().forEach((object, index) => {
        ensureObjectMeta(object, index)
        object.selectable = isSelect
        object.evented = isSelect
        object.hoverCursor = isFill ? 'crosshair' : 'move'
        if (object.locked) applyLockState(object, true)
        if (isImageObject(object) && object.customEffects) {
          applyEffectsToFabricObject(object, object.customEffects)
        }
      })
    },
    [applyEffectsToFabricObject, ensureObjectMeta]
  )

  const restoreCanvasSnapshot = useCallback(
    (snapshot) => {
      const canvas = fabricCanvas.current
      if (!canvas || !snapshot) return

      isRestoringRef.current = true
      canvas
        .loadFromJSON(snapshot)
        .then(() => {
          if (fabricCanvas.current !== canvas) return
          hydrateCanvasObjects(canvas)
          canvas.backgroundColor = projectAppearanceRef.current.transparentBackground
            ? 'rgba(0,0,0,0)'
            : projectAppearanceRef.current.backgroundColor || '#ffffff'
          canvas.discardActiveObject()
          canvas.renderAll()
          requestAnimationFrame(() => canvas.requestRenderAll())
          canvas.calcOffset?.()
          updateStore()
          isRestoringRef.current = false
          syncProjectState({ dirty: true })
        })
        .catch((error) => {
          console.error('Failed to restore canvas snapshot:', error)
          isRestoringRef.current = false
        })
    },
    [hydrateCanvasObjects, syncProjectState, updateStore]
  )

  const runCanvasMutation = useCallback(
    (mutation) => {
      const canvas = fabricCanvas.current
      if (!canvas) return

      batchMutationRef.current = true
      try {
        mutation(canvas)
      } finally {
        batchMutationRef.current = false
      }

      canvas.requestRenderAll()
      commitCanvasState()
    },
    [commitCanvasState]
  )

  const applyActiveObjectUpdate = useCallback(
    (updater) => {
      const canvas = fabricCanvas.current
      const currentActiveObject = canvas?.getActiveObject()
      if (!canvas || !currentActiveObject) return

      if (typeof updater === 'function') {
        updater(currentActiveObject)
      } else {
        currentActiveObject.set(updater)
      }

      currentActiveObject.setCoords?.()
      canvas.requestRenderAll()
      commitCanvasState()
    },
    [commitCanvasState]
  )

  const clearGuideLines = useCallback((shouldRender = false) => {
    if (guideLinesRef.current.length === 0) return

    guideLinesRef.current = []
    if (shouldRender) {
      fabricCanvas.current?.requestRenderAll()
    }
  }, [])

  const updateBrushSettings = useCallback((updates) => {
    setSettingsState((current) => ({
      ...current,
      ...updates
    }))
  }, [])

  const generateBrushSeed = useCallback(() => {
    updateBrushSettings({
      brushSeed: Math.floor(Math.random() * 900000000) + 100000000
    })
  }, [updateBrushSettings])

  const resolveSnapCandidate = useCallback((axis, object, points, candidates, tolerance) => {
    const objectId = object?.id || object
    const currentLock = snapLocksRef.current[axis]

    if (currentLock?.objectId === objectId) {
      const lockedPoint = points.find((point) => point.id === currentLock.pointId)
      const lockedCandidate = candidates.find(
        (candidate) => candidate.id === currentLock.candidateId
      )

      if (lockedPoint && lockedCandidate) {
        const diff = lockedCandidate.value - lockedPoint.value
        if (Math.abs(diff) <= tolerance * 2) {
          return {
            diff,
            value: lockedCandidate.value,
            pointId: lockedPoint.id,
            candidateId: lockedCandidate.id
          }
        }
      }
    }

    let bestMatch = null

    points.forEach((point) => {
      candidates.forEach((candidate) => {
        const diff = candidate.value - point.value
        if (Math.abs(diff) > tolerance) return

        if (!bestMatch || Math.abs(diff) < Math.abs(bestMatch.diff)) {
          bestMatch = {
            diff,
            value: candidate.value,
            pointId: point.id,
            candidateId: candidate.id
          }
        }
      })
    })

    snapLocksRef.current[axis] = bestMatch
      ? {
          objectId,
          pointId: bestMatch.pointId,
          candidateId: bestMatch.candidateId
        }
      : null

    return bestMatch
  }, [])

  const selectLayerObject = useCallback(
    (object, event = null) => {
      const canvas = fabricCanvas.current
      if (!canvas || !object) return

      setLayerContextMenu(null)
      const isMulti = Boolean(event && (event.shiftKey || event.ctrlKey || event.metaKey))

      if (isMulti) {
        const active = canvas.getActiveObject()
        if (!active) {
          canvas.setActiveObject(object)
        } else if (isActiveSelection(active)) {
          const currentObjects = active.getObjects().slice()
          if (currentObjects.includes(object)) {
            const nextObjects = currentObjects.filter((item) => item !== object)
            canvas.discardActiveObject()
            if (nextObjects.length === 1) {
              canvas.setActiveObject(nextObjects[0])
            } else if (nextObjects.length > 1) {
              const newSelection = new fabric.ActiveSelection(nextObjects, { canvas })
              canvas.setActiveObject(newSelection)
            }
          } else {
            canvas.discardActiveObject()
            const newSelection = new fabric.ActiveSelection([...currentObjects, object], { canvas })
            canvas.setActiveObject(newSelection)
          }
        } else if (active !== object) {
          canvas.discardActiveObject()
          const newSelection = new fabric.ActiveSelection([active, object], { canvas })
          canvas.setActiveObject(newSelection)
        }
      } else {
        canvas.setActiveObject(object)
      }

      canvas.requestRenderAll()
      updateStore()
    },
    [updateStore]
  )

  const handleLayerClick = useCallback(
    (layer, index, event) => {
      const canvas = fabricCanvas.current
      if (!canvas || !layer?.ref) return

      setLayerContextMenu(null)

      if (event.shiftKey && lastSelectedLayerIndexRef.current !== null) {
        const start = Math.min(lastSelectedLayerIndexRef.current, index)
        const end = Math.max(lastSelectedLayerIndexRef.current, index)
        const rangeLayers = layers.slice(start, end + 1).map((item) => item.ref).filter(Boolean)

        canvas.discardActiveObject()
        if (rangeLayers.length === 1) {
          canvas.setActiveObject(rangeLayers[0])
        } else if (rangeLayers.length > 1) {
          const newSelection = new fabric.ActiveSelection(rangeLayers, { canvas })
          canvas.setActiveObject(newSelection)
        }
        canvas.requestRenderAll()
        updateStore()
        return
      }

      lastSelectedLayerIndexRef.current = index
      selectLayerObject(layer.ref, event)
    },
    [layers, selectLayerObject, updateStore]
  )

  const toggleAppMenu = useCallback(() => {
    setMenuOpen((previous) => {
      const nextValue = !previous
      if (nextValue) setMenuView('main')
      return nextValue
    })
  }, [])

  const closeAppMenu = useCallback(() => {
    setMenuOpen(false)
    setMenuView('main')
  }, [])

  const resetEditorState = useCallback(
    (
      nextSize = DEFAULT_SIZE,
      { preservePendingProject = false, nextProject = DEFAULT_PROJECT } = {}
    ) => {
      if (!preservePendingProject) {
        pendingProjectRef.current = null
      }

      guideLinesRef.current = []
      historyRef.current = { past: [], current: null, future: [] }

      if (historyTimeoutRef.current) {
        clearTimeout(historyTimeoutRef.current)
        historyTimeoutRef.current = null
      }

      setHistoryState({ undo: 0, redo: 0 })
      setLayers([])
      setActiveId(null)
      setDragLayerId(null)
      setDropIndex(null)
      setMenuOpen(false)
      setMenuView('main')
      setActiveTool('select')
      setZoom(DEFAULT_ZOOM)
      setViewOffset({ x: 0, y: 0 })
      viewOffsetRef.current = { x: 0, y: 0 }
      zoomRef.current = DEFAULT_ZOOM
      setSize(nextSize)
      setDraftSize(nextSize)
      setCurrentProject(nextProject)
      setInit(false)
      syncProjectState({ dirty: false, hasContent: false })
    },
    [syncProjectState]
  )

  const startEditorSession = useCallback(
    (nextSize = DEFAULT_SIZE, options = {}) => {
      resetEditorState(nextSize, options)

      requestAnimationFrame(() => {
        setInit(true)
      })
    },
    [resetEditorState]
  )

  const handleUndo = useCallback(() => {
    const canvas = fabricCanvas.current
    const history = historyRef.current
    if (!canvas || !history.past.length || !history.current) return

    const previousSnapshot = history.past.pop()
    history.future.push(history.current)
    history.current = previousSnapshot
    syncHistoryCounters()
    restoreCanvasSnapshot(previousSnapshot)
  }, [restoreCanvasSnapshot, syncHistoryCounters])

  const handleRedo = useCallback(() => {
    const canvas = fabricCanvas.current
    const history = historyRef.current
    if (!canvas || !history.future.length || !history.current) return

    const nextSnapshot = history.future.pop()
    history.past.push(history.current)
    history.current = nextSnapshot
    syncHistoryCounters()
    restoreCanvasSnapshot(nextSnapshot)
  }, [restoreCanvasSnapshot, syncHistoryCounters])

  const applyFontFamily = useCallback(
    (fontFamily) => {
      const canvas = fabricCanvas.current
      const currentActiveObject = canvas?.getActiveObject()
      if (!canvas || !isTextObject(currentActiveObject)) return

      applyActiveObjectUpdate({ fontFamily })
      setSettingsState((current) => ({
        ...current,
        recentFonts: updateRecentFonts(current.recentFonts, fontFamily)
      }))
      setFontPickerOpen(false)
    },
    [applyActiveObjectUpdate]
  )

  const captureStyleFromObject = useCallback((object, nextName) => {
    if (!object) return null

    const shadow = object.shadow
      ? {
          color: object.shadow.color,
          blur: object.shadow.blur,
          offsetX: object.shadow.offsetX,
          offsetY: object.shadow.offsetY
        }
      : null

    return {
      id: createObjectId(),
      name: nextName || object.name || `Стиль ${object.type || 'layer'}`,
      targetType: object.type,
      createdAt: Date.now(),
      data: {
        fill: object.fill ?? null,
        stroke: object.stroke ?? null,
        strokeWidth: object.strokeWidth ?? null,
        opacity: object.opacity ?? 1,
        fontFamily: object.fontFamily ?? null,
        fontSize: object.fontSize ?? null,
        fontWeight: object.fontWeight ?? null,
        fontStyle: object.fontStyle ?? null,
        underline: object.underline ?? false,
        rx: object.rx ?? null,
        ry: object.ry ?? null,
        shadow,
        globalCompositeOperation: object.globalCompositeOperation || 'source-over',
        effects: normalizeEffects(object.customEffects)
      }
    }
  }, [])

  const applyStylePreset = useCallback(
    (preset) => {
      if (!preset) return

      runCanvasMutation((canvas) => {
        const object = canvas.getActiveObject()
        if (!object || isActiveSelection(object)) return

        const nextData = preset.data || {}
        const updates = {}

        ;[
          'fill',
          'stroke',
          'strokeWidth',
          'opacity',
          'fontFamily',
          'fontSize',
          'fontWeight',
          'fontStyle',
          'underline',
          'rx',
          'ry',
          'globalCompositeOperation'
        ].forEach((key) => {
          if (nextData[key] !== undefined && nextData[key] !== null) {
            updates[key] = nextData[key]
          }
        })

        object.set({
          ...updates,
          customStyleId: preset.id
        })

        if (nextData.shadow) {
          object.set('shadow', new fabric.Shadow(nextData.shadow))
        } else {
          object.set('shadow', null)
        }

        applyEffectsToFabricObject(object, nextData.effects)
      })
    },
    [applyEffectsToFabricObject, runCanvasMutation]
  )

  const saveCurrentStylePreset = useCallback(() => {
    if (!activeObject || isActiveSelection(activeObject)) return

    const style = captureStyleFromObject(activeObject, styleNameDraft.trim() || undefined)
    if (!style) return

    setSettingsState((current) => ({
      ...current,
      stylePresets: [style, ...(current.stylePresets || [])].slice(0, 40)
    }))
    setStyleNameDraft(style.name)
  }, [activeObject, captureStyleFromObject, styleNameDraft])

  const deleteStylePreset = useCallback((presetId) => {
    setSettingsState((current) => ({
      ...current,
      stylePresets: (current.stylePresets || []).filter((item) => item.id !== presetId)
    }))
  }, [])

  const exportStylePreset = useCallback(async (preset) => {
    if (!preset || !window.electronAPI?.saveStyleFile) return

    try {
      const result = await window.electronAPI.saveStyleFile({
        name: preset.name,
        jsonString: JSON.stringify(
          {
            format: 'rdtxt',
            version: 1,
            style: preset
          },
          null,
          2
        )
      })
      if (!result?.saved && !result?.canceled) {
        alert('Не удалось экспортировать стиль текста.')
      }
    } catch (error) {
      console.error('Failed to export style preset:', error)
      alert('Ошибка при сохранении стиля текста.')
    }
  }, [])

  const importStylePreset = useCallback(async () => {
    if (!window.electronAPI?.openStyleFile) return

    try {
      const result = await window.electronAPI.openStyleFile()
      if (!result?.content) return

      const parsed = JSON.parse(result.content)
      const importedStyle = parsed?.style
      if (!importedStyle?.data) {
        alert('Выбран неверный или неподдерживаемый формат стиля.')
        return
      }

      const normalizedStyle = {
        ...importedStyle,
        id: importedStyle.id || createObjectId(),
        name: importedStyle.name || 'Импортированный стиль',
        data: {
          ...importedStyle.data,
          effects: normalizeEffects(importedStyle.data.effects)
        }
      }

      setSettingsState((current) => ({
        ...current,
        stylePresets: [normalizedStyle, ...(current.stylePresets || [])].slice(0, 40)
      }))
    } catch (error) {
      console.error('Failed to import style preset:', error)
      alert('Не удалось прочитать файл стиля. Возможно, файл поврежден.')
    }
  }, [])

  const updateActiveObjectEffects = useCallback(
    (key, value) => {
      const canvas = fabricCanvas.current
      const object = canvas?.getActiveObject()
      if (!canvas || !object || isActiveSelection(object)) return

      runCanvasMutation(() => {
        const nextEffects = normalizeEffects({
          ...object.customEffects,
          [key]: value
        })

        applyEffectsToFabricObject(object, nextEffects)
      })
    },
    [applyEffectsToFabricObject, runCanvasMutation]
  )

  const handleRemoveBackground = useCallback(async () => {
    const canvas = fabricCanvas.current
    const object = canvas?.getActiveObject()
    if (!canvas || !object || !isImageObject(object) || isRemovingBg) return
    if (!window.electronAPI?.removeBackground) return

    setIsRemovingBg(true)
    try {
      const imgEl = object.getElement()
      if (!imgEl) throw new Error('Image element not found')

      const origW = imgEl.naturalWidth || imgEl.width || object.width
      const origH = imgEl.naturalHeight || imgEl.height || object.height
      if (!origW || !origH) throw new Error('Invalid image dimensions')

      const inputCanvas = document.createElement('canvas')
      inputCanvas.width = 320
      inputCanvas.height = 320
      const inputCtx = inputCanvas.getContext('2d')
      inputCtx.drawImage(imgEl, 0, 0, 320, 320)
      const imgData = inputCtx.getImageData(0, 0, 320, 320).data

      const tensorData = new Float32Array(3 * 320 * 320)
      const mean = [0.485, 0.456, 0.406]
      const std = [0.229, 0.224, 0.225]

      for (let i = 0; i < 320 * 320; i++) {
        const r = imgData[i * 4] / 255
        const g = imgData[i * 4 + 1] / 255
        const b = imgData[i * 4 + 2] / 255

        tensorData[i] = (r - mean[0]) / std[0]
        tensorData[320 * 320 + i] = (g - mean[1]) / std[1]
        tensorData[2 * 320 * 320 + i] = (b - mean[2]) / std[2]
      }

      const res = await window.electronAPI.removeBackground({ tensorData })
      if (!res || !res.success || !res.maskData) {
        throw new Error(res?.error || 'Background removal failed')
      }

      const maskData = res.maskData
      let minVal = Infinity
      let maxVal = -Infinity
      for (let i = 0; i < maskData.length; i++) {
        const v = maskData[i]
        if (v < minVal) minVal = v
        if (v > maxVal) maxVal = v
      }

      const range = maxVal - minVal || 1
      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = 320
      maskCanvas.height = 320
      const maskCtx = maskCanvas.getContext('2d')
      const maskImgData = maskCtx.createImageData(320, 320)

      for (let i = 0; i < maskData.length; i++) {
        const norm = (maskData[i] - minVal) / range
        const alpha = Math.round(norm * 255)
        const idx = i * 4
        maskImgData.data[idx] = 255
        maskImgData.data[idx + 1] = 255
        maskImgData.data[idx + 2] = 255
        maskImgData.data[idx + 3] = alpha
      }
      maskCtx.putImageData(maskImgData, 0, 0)

      const outCanvas = document.createElement('canvas')
      outCanvas.width = origW
      outCanvas.height = origH
      const outCtx = outCanvas.getContext('2d')
      outCtx.drawImage(imgEl, 0, 0, origW, origH)
      outCtx.globalCompositeOperation = 'destination-in'
      outCtx.imageSmoothingQuality = 'high'
      outCtx.drawImage(maskCanvas, 0, 0, origW, origH)

      const finalDataUrl = outCanvas.toDataURL('image/png')
      if (!object.originalSrc) {
        object.originalSrc = object.getSrc?.() || imgEl.src
      }

      await object.setSrc(finalDataUrl)
      object.dirty = true
      canvas.requestRenderAll()
      commitCanvasState()
    } catch (err) {
      console.error('Remove background error:', err)
    } finally {
      setIsRemovingBg(false)
    }
  }, [commitCanvasState, isRemovingBg])

  const handleRestoreBackground = useCallback(async () => {
    const canvas = fabricCanvas.current
    const object = canvas?.getActiveObject()
    if (!canvas || !object || !isImageObject(object) || !object.originalSrc) return

    try {
      await object.setSrc(object.originalSrc)
      object.originalSrc = null
      object.dirty = true
      canvas.requestRenderAll()
      commitCanvasState()
    } catch (err) {
      console.error('Restore background error:', err)
    }
  }, [commitCanvasState])

  const handleVectorizeImage = useCallback(
    async (targetObject = null, mode = 'color') => {
      const canvas = fabricCanvas.current
      const object = targetObject || canvas?.getActiveObject()
      if (!canvas || !object || !isImageObject(object) || isVectorizing) return

      setIsVectorizing(true)
      await new Promise((resolve) => setTimeout(resolve, 30))

      try {
        const imgEl = object.getElement()
        if (!imgEl) throw new Error('Image element not found')

        const naturalW = imgEl.naturalWidth || imgEl.width || object.width || 400
        const naturalH = imgEl.naturalHeight || imgEl.height || object.height || 400
        const maxTraceDim = 600
        let traceW = naturalW
        let traceH = naturalH
        if (traceW > maxTraceDim || traceH > maxTraceDim) {
          if (traceW >= traceH) {
            traceH = Math.max(1, Math.round((traceH * maxTraceDim) / traceW))
            traceW = maxTraceDim
          } else {
            traceW = Math.max(1, Math.round((traceW * maxTraceDim) / traceH))
            traceH = maxTraceDim
          }
        }

        const traceCanvas = document.createElement('canvas')
        traceCanvas.width = traceW
        traceCanvas.height = traceH
        const traceCtx = traceCanvas.getContext('2d')
        traceCtx.drawImage(imgEl, 0, 0, traceW, traceH)
        const imgData = traceCtx.getImageData(0, 0, traceW, traceH)

        const options =
          mode === 'bw'
            ? {
                ltres: 1,
                qtres: 1,
                pathomit: 8,
                colorsampling: 0,
                numberofcolors: 2,
                colorquantcycles: 3,
                scale: 1,
                strokewidth: 0,
                viewbox: true
              }
            : {
                ltres: 1,
                qtres: 1,
                pathomit: 8,
                colorsampling: 2,
                numberofcolors: 16,
                colorquantcycles: 3,
                scale: 1,
                strokewidth: 0,
                viewbox: true
              }

        const svgString = ImageTracer.imagedataToSVG(imgData, options)
        const { objects, options: svgOptions } = await fabric.loadSVGFromString(svgString)
        const validObjects = (objects || []).filter(Boolean)
        if (!validObjects.length) throw new Error('No vector paths generated')

        const vectorObject = fabric.util.groupSVGElements(validObjects, svgOptions)
        const targetW = object.getScaledWidth()
        const targetH = object.getScaledHeight()

        if (vectorObject.width && vectorObject.height) {
          vectorObject.set({
            scaleX: targetW / vectorObject.width,
            scaleY: targetH / vectorObject.height
          })
        }

        vectorObject.set({
          left: object.left,
          top: object.top,
          angle: object.angle || 0,
          originX: object.originX || 'left',
          originY: object.originY || 'top',
          selectable: activeToolRef.current === 'select',
          evented: activeToolRef.current === 'select',
          customEffects: normalizeEffects(),
          globalCompositeOperation: 'source-over'
        })

        ensureObjectMeta(vectorObject, canvas.getObjects().length)
        vectorObject.name = `VECTOR ${object.name || 'IMAGE'}`

        runCanvasMutation((c) => {
          c.add(vectorObject)
          if (activeToolRef.current === 'select') {
            c.setActiveObject(vectorObject)
          }
        })
        updateStore()
      } catch (err) {
        console.error('Vectorize error:', err)
      } finally {
        setIsVectorizing(false)
        setLayerContextMenu(null)
      }
    },
    [ensureObjectMeta, isVectorizing, runCanvasMutation, updateStore]
  )

  const updateTabs = useCallback((updater) => {
    const next = updater(tabsRef.current)
    tabsRef.current = next
    setTabs(next)
  }, [])

  const selectTabId = useCallback((id) => {
    activeTabIdRef.current = id
    setActiveTabId(id)
  }, [])

  const stashActiveTab = useCallback(() => {
    const currentTabId = activeTabIdRef.current
    if (!currentTabId || !fabricCanvas.current || pendingProjectRef.current != null) return

    commitCanvasState()
    updateTabs((current) =>
      current.map((tab) =>
        tab.id === currentTabId
          ? {
              ...tab,
              name: currentProject.name,
              path: currentProject.path,
              backgroundColor: currentProject.backgroundColor,
              transparentBackground: currentProject.transparentBackground,
              size,
              snapshot: getCanvasSnapshot(),
              history: historyRef.current,
              dirty: projectStateRef.current.dirty
            }
          : tab
      )
    )
  }, [commitCanvasState, currentProject, getCanvasSnapshot, size, updateTabs])

  const openInNewTab = useCallback(
    (nextSize, nextProject, snapshot = null) => {
      stashActiveTab()

      const id = createTabId()
      updateTabs((current) => [
        ...current,
        {
          id,
          name: nextProject.name,
          path: nextProject.path || '',
          backgroundColor: nextProject.backgroundColor,
          transparentBackground: nextProject.transparentBackground,
          size: nextSize,
          snapshot,
          history: null,
          dirty: false
        }
      ])
      selectTabId(id)

      pendingDirtyRef.current = false
      pendingHistoryRef.current = null
      if (snapshot) pendingProjectRef.current = snapshot
      startEditorSession(nextSize, { nextProject, preservePendingProject: Boolean(snapshot) })
    },
    [selectTabId, startEditorSession, stashActiveTab, updateTabs]
  )

  const switchTab = useCallback(
    (id, { skipStash = false } = {}) => {
      if (id === activeTabIdRef.current && !skipStash) return

      const target = tabsRef.current.find((tab) => tab.id === id)
      if (!target) return

      if (!skipStash) stashActiveTab()
      const latest = tabsRef.current.find((tab) => tab.id === id) || target

      selectTabId(id)
      pendingDirtyRef.current = Boolean(latest.dirty)
      pendingHistoryRef.current = latest.history || null
      pendingProjectRef.current = latest.snapshot || EMPTY_CANVAS_SNAPSHOT
      startEditorSession(latest.size, {
        preservePendingProject: true,
        nextProject: {
          path: latest.path,
          name: latest.name,
          backgroundColor: latest.backgroundColor,
          transparentBackground: latest.transparentBackground
        }
      })
    },
    [selectTabId, startEditorSession, stashActiveTab]
  )

  const closeTab = useCallback(
    (id) => {
      const list = tabsRef.current
      const index = list.findIndex((tab) => tab.id === id)
      if (index < 0) return

      const isActive = id === activeTabIdRef.current
      const dirty = isActive ? projectStateRef.current.dirty : list[index].dirty
      const name = isActive ? currentProject.name : list[index].name
      if (dirty && !window.confirm(t('tabs.unsavedConfirm', { name }))) {
        return
      }

      const remaining = list.filter((tab) => tab.id !== id)
      updateTabs(() => remaining)
      if (!isActive) {
        syncProjectState({ dirty: projectStateRef.current.dirty })
        return
      }

      if (remaining.length) {
        switchTab(remaining[Math.min(index, remaining.length - 1)].id, { skipStash: true })
      } else {
        selectTabId(null)
        resetEditorState(DEFAULT_SIZE)
      }
    },
    [currentProject.name, resetEditorState, selectTabId, switchTab, syncProjectState, updateTabs]
  )

  const saveInactiveTab = useCallback(
    async (tab) => {
      const result = await window.electronAPI.saveProject({
        jsonString: JSON.stringify({
          version: 1,
          size: tab.size,
          project: {
            name: tab.name,
            backgroundColor: tab.backgroundColor,
            transparentBackground: tab.transparentBackground
          },
          canvas: JSON.parse(tab.snapshot || EMPTY_CANVAS_SNAPSHOT)
        }),
        filePath: tab.path || null
      })

      if (result?.saved) {
        updateTabs((current) =>
          current.map((item) =>
            item.id === tab.id
              ? {
                  ...item,
                  path: result.filePath || item.path,
                  name: result.projectName || item.name,
                  dirty: false
                }
              : item
          )
        )
        setRecentProjects(result.recentProjects || [])
      }
      return result
    },
    [updateTabs]
  )

  const openProjectSetup = useCallback(
    (overrides = {}) => {
      const draft = createProjectDraft()

      setProjectDraft({
        ...draft,
        ...overrides,
        width: overrides.width ?? draft.width,
        height: overrides.height ?? draft.height
      })
      setProjectSetupOpen(true)
      closeAppMenu()
    },
    [closeAppMenu]
  )

  const confirmProjectSetup = useCallback(() => {
    const nextSize = normalizeSize({ w: projectDraft.width, h: projectDraft.height })
    const nextProject = {
      ...DEFAULT_PROJECT,
      name: projectDraft.name?.trim() || DEFAULT_PROJECT.name,
      backgroundColor: projectDraft.backgroundColor || '#ffffff',
      transparentBackground: Boolean(projectDraft.transparentBackground)
    }

    setSettingsState((current) => ({
      ...current,
      showGrid: Boolean(projectDraft.showGrid)
    }))

    setProjectSetupOpen(false)
    openInNewTab(nextSize, nextProject)
  }, [openInNewTab, projectDraft])

  const handleSaveProject = useCallback(
    async ({ saveAs = false, keepMenuOpen = false } = {}) => {
      if (!fabricCanvas.current || !window.electronAPI) return

      const data = {
        version: 1,
        size,
        project: {
          name: currentProject.name,
          backgroundColor: currentProject.backgroundColor,
          transparentBackground: currentProject.transparentBackground
        },
        canvas: fabricCanvas.current.toJSON(CUSTOM_SERIALIZATION_FIELDS)
      }

      const result = await window.electronAPI.saveProject({
        jsonString: JSON.stringify(data),
        filePath: !saveAs && currentProject.path ? currentProject.path : null
      })
      if (result?.saved) {
        setCurrentProject({
          path: result.filePath || currentProject.path,
          name:
            result.projectName ||
            getProjectNameFromPath(result.filePath || currentProject.path) ||
            DEFAULT_PROJECT.name,
          backgroundColor: currentProject.backgroundColor,
          transparentBackground: currentProject.transparentBackground
        })
        setRecentProjects(result.recentProjects || [])
        syncProjectState({
          dirty: false,
          hasContent: Boolean(fabricCanvas.current?.getObjects().length)
        })
      }

      if (!keepMenuOpen) {
        closeAppMenu()
      }

      return result
    },
    [
      closeAppMenu,
      currentProject.backgroundColor,
      currentProject.name,
      currentProject.path,
      currentProject.transparentBackground,
      size,
      syncProjectState
    ]
  )

  const handleOpenProject = useCallback(
    async (requestedPath = null) => {
      if (!window.electronAPI?.openProject) return

      const nextPath =
        typeof requestedPath === 'string'
          ? requestedPath
          : typeof requestedPath === 'object' && requestedPath && 'filePath' in requestedPath
            ? requestedPath.filePath
            : null

      const result = await window.electronAPI.openProject(
        nextPath ? { filePath: nextPath } : undefined
      )
      if (!result?.content) return

      closeAppMenu()

      const openedPath = result.filePath || nextPath
      const openTab = openedPath
        ? tabsRef.current.find((tab) =>
            tab.id === activeTabIdRef.current
              ? currentProjectRef.current?.path === openedPath
              : tab.path === openedPath
          )
        : null
      if (openTab) {
        switchTab(openTab.id)
        return
      }

      try {
        const data = JSON.parse(result.content)
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid project format')
        }
        if (data.version && data.version > 1) {
          console.warn(`Проект создан в более новой версии (${data.version}).`)
        }
        const nextSize = normalizeSize(data.size)
        const nextProject = {
          path: result.filePath || nextPath || '',
          name:
            data.project?.name ||
            result.projectName ||
            getProjectNameFromPath(result.filePath || nextPath) ||
            DEFAULT_PROJECT.name,
          backgroundColor: data.project?.backgroundColor || '#ffffff',
          transparentBackground: Boolean(data.project?.transparentBackground)
        }

        setRecentProjects(result.recentProjects || [])
        openInNewTab(nextSize, nextProject, JSON.stringify(data.canvas || { objects: [] }))
      } catch (error) {
        console.error('Ошибка при чтении файла проекта:', error)
        alert('Не удалось открыть файл. Возможно, проект поврежден.')
      }
    },
    [closeAppMenu, openInNewTab, switchTab]
  )

  openProjectRef.current = handleOpenProject

  const handleCreateProject = useCallback(() => {
    openProjectSetup()
  }, [openProjectSetup])

  const startResize = useCallback(
    (type, event) => {
      event.preventDefault()
      resizeStateRef.current = {
        type,
        startX: event.clientX,
        startY: event.clientY,
        sidebarWidth,
        layerPanelHeight,
        fontMenuHeight
      }
      document.body.classList.add('app-resizing')
    },
    [fontMenuHeight, layerPanelHeight, sidebarWidth]
  )

  const addImageFromSource = useCallback(
    async (source) => {
      const canvas = fabricCanvas.current
      if (!canvas) return

      try {
        const image = await fabric.FabricImage.fromURL(source)
        ensureObjectMeta(image)

        const scale = Math.min(
          1,
          (canvas.width * 0.9) / (image.width || 1),
          (canvas.height * 0.9) / (image.height || 1)
        )
        image.scale(scale)
        image.set({
          left: (canvas.width - image.width * scale) / 2,
          top: (canvas.height - image.height * scale) / 2,
          selectable: activeTool === 'select',
          evented: activeTool === 'select',
          globalCompositeOperation: 'source-over',
          customEffects: normalizeEffects()
        })

        canvas.add(image)
        if (activeTool === 'select') {
          canvas.setActiveObject(image)
        } else {
          canvas.discardActiveObject()
        }
        canvas.requestRenderAll()
      } catch (error) {
        console.error('Failed to load image:', error)
        alert('Не удалось загрузить изображение.')
      }
    },
    [activeTool, ensureObjectMeta]
  )

  const addImageFromFile = useCallback(
    (file) => {
      if (!file || !file.type.startsWith('image/')) return

      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        alert('Изображение слишком большое (максимум 20 МБ).')
        return
      }

      const reader = new FileReader()
      reader.onload = () => addImageFromSource(reader.result)
      reader.onerror = () => alert('Не удалось прочитать файл изображения.')
      reader.readAsDataURL(file)
    },
    [addImageFromSource]
  )

  const addImageToCanvas = useCallback(async () => {
    if (!window.electronAPI || !fabricCanvas.current) return

    const result = await window.electronAPI.openFile()
    if (!result) return

    await addImageFromSource(`data:${result.mime};base64,${result.base64}`)
  }, [addImageFromSource])

  const handleOpenFile = useCallback(async () => {
    await addImageToCanvas()
    closeAppMenu()
  }, [addImageToCanvas, closeAppMenu])

  const renderExportBytes = useCallback(async (format) => {
    const liveCanvas = fabricCanvas.current
    if (!liveCanvas) return null

    const exportCanvas = await liveCanvas.clone(CUSTOM_SERIALIZATION_FIELDS)

    try {
      exportCanvas.discardActiveObject?.()
      if (
        (format === 'jpeg' || format === 'pdf') &&
        (projectAppearanceRef.current.transparentBackground || !exportCanvas.backgroundColor)
      ) {
        exportCanvas.backgroundColor = '#ffffff'
      }
      exportCanvas.renderAll()

      if (format === 'svg') {
        return new TextEncoder().encode(exportCanvas.toSVG())
      }

      if (format === 'pdf') {
        const jpegUrl = exportCanvas.toDataURL({ format: 'jpeg', quality: 0.95 })
        return buildPdfFromJpeg(dataUrlToBytes(jpegUrl), exportCanvas.width, exportCanvas.height)
      }

      const dataUrl = exportCanvas.toDataURL({
        format,
        quality: format === 'jpeg' ? 0.92 : 1
      })

      return dataUrlToBytes(dataUrl)
    } finally {
      exportCanvas.dispose()
    }
  }, [])

  const handleExport = useCallback(
    async (format) => {
      if (!fabricCanvas.current || !window.electronAPI?.saveImage) return

      const exportFormat = ['jpeg', 'svg', 'pdf'].includes(format) ? format : 'png'

      try {
        const bytes = await renderExportBytes(exportFormat)
        if (!bytes) {
          alert('Не удалось экспортировать изображение.')
          return
        }

        const result = await window.electronAPI.saveImage(bytes, exportFormat, 0.92)
        if (result?.saved || result?.canceled) {
          closeAppMenu()
          return
        }

        alert('Не удалось экспортировать изображение.')
      } catch (error) {
        console.error('Failed to export image:', error)
        alert('Не удалось экспортировать изображение.')
      }
    },
    [closeAppMenu, renderExportBytes]
  )

  const addObj = useCallback(
    (type) => {
      const canvas = fabricCanvas.current
      if (!canvas) return

      const base = {
        left: 100,
        top: 100,
        fill: settingsState.defaultColor,
        globalCompositeOperation: 'source-over',
        customEffects: normalizeEffects()
      }

      let object = null

      if (type === 'rect') {
        object = new fabric.Rect({ ...base, width: 200, height: 200, rx: 0, ry: 0 })
      }
      if (type === 'circle') {
        object = new fabric.Circle({ ...base, radius: 100 })
      }
      if (type === 'line') {
        object = new fabric.Line([100, 100, 300, 100], {
          stroke: settingsState.defaultColor,
          strokeWidth: 4
        })
      }
      if (type === 'text') {
        object = new fabric.IText('Текст', {
          ...base,
          fontSize: 48,
          fontFamily: settingsState.recentFonts[0] || RECOMMENDED_FONTS[0] || 'Inter'
        })
      }

      if (!object) return

      ensureObjectMeta(object)
      object.set({
        selectable: activeTool === 'select',
        evented: activeTool === 'select'
      })

      canvas.add(object)
      if (activeTool === 'select') {
        canvas.setActiveObject(object)
      } else {
        canvas.discardActiveObject()
      }
      canvas.requestRenderAll()
    },
    [activeTool, ensureObjectMeta, settingsState.defaultColor, settingsState.recentFonts]
  )

  const moveLayerToIndex = useCallback(
    (object, toIndex) => {
      const canvas = fabricCanvas.current
      if (!object || !canvas) return

      const objects = canvas.getObjects()
      const currentIndex = objects.indexOf(object)
      const newIndex = objects.length - 1 - toIndex
      if (currentIndex < 0 || newIndex < 0 || newIndex >= objects.length) return

      canvas.moveObjectTo(object, newIndex)
      object.setCoords?.()
      canvas.setActiveObject(object)
      canvas.requestRenderAll()
      commitCanvasState()
    },
    [commitCanvasState]
  )

  const removeLayer = useCallback(
    (object) => {
      if (!object) return
      runCanvasMutation((canvas) => {
        const targets = isActiveSelection(object) ? [...object.getObjects()] : [object]
        canvas.discardActiveObject()
        targets.forEach((item) => canvas.remove(item))
      })
    },
    [runCanvasMutation]
  )

  const startRenamingLayer = useCallback((layer) => {
    if (!layer) return
    setEditingLayerId(layer.id)
    setEditingLayerName(layer.name || '')
    setLayerContextMenu(null)
  }, [])

  const finishRenamingLayer = useCallback(
    (layer, nextName) => {
      setEditingLayerId(null)
      const trimmed = nextName?.trim()
      if (!layer?.ref || !trimmed || trimmed === layer.name) return

      runCanvasMutation(() => {
        layer.ref.set('name', trimmed)
      })
    },
    [runCanvasMutation]
  )

  const duplicateLayer = useCallback(
    async (object) => {
      const canvas = fabricCanvas.current
      if (!canvas || !object?.clone) return

      try {
        const clone = await object.clone(CUSTOM_SERIALIZATION_FIELDS)
        assignFreshIds(clone)

        runCanvasMutation((canvasInstance) => {
          ensureObjectMeta(clone, canvasInstance.getObjects().length)
          clone.set({
            left: (object.left || 0) + 24,
            top: (object.top || 0) + 24,
            selectable: activeTool === 'select',
            evented: activeTool === 'select'
          })
          canvasInstance.add(clone)
          if (activeTool === 'select') {
            canvasInstance.setActiveObject(clone)
          }
        })
      } catch (error) {
        console.error('Failed to duplicate layer:', error)
      } finally {
        setLayerContextMenu(null)
      }
    },
    [activeTool, ensureObjectMeta, runCanvasMutation]
  )

  const groupSelectedLayers = useCallback(() => {
    const canvas = fabricCanvas.current
    if (!canvas) return

    const selection = canvas.getActiveObject()
    let selectedObjects = []

    if (isActiveSelection(selection)) {
      selectedObjects = selection.getObjects().slice()
    } else if (selectedObjectIds.length > 1) {
      selectedObjects = canvas.getObjects().filter((obj) => selectedObjectIds.includes(obj.id))
    }

    if (selectedObjects.length < 2) return

    runCanvasMutation((canvasInstance) => {
      canvasInstance.discardActiveObject()
      selectedObjects.forEach((object) => canvasInstance.remove(object))

      const group = new fabric.Group(selectedObjects, {
        subTargetCheck: false,
        interactive: false
      })

      ensureObjectMeta(group, canvasInstance.getObjects().length)
      group.set({
        selectable: activeTool === 'select',
        evented: activeTool === 'select',
        customEffects: normalizeEffects(),
        globalCompositeOperation: 'source-over'
      })

      canvasInstance.add(group)
      if (activeTool === 'select') {
        canvasInstance.setActiveObject(group)
      }
    })

    setLayerContextMenu(null)
  }, [activeTool, ensureObjectMeta, runCanvasMutation, selectedObjectIds])

  const ungroupLayer = useCallback(
    (groupObject) => {
      if (!isGroupObject(groupObject)) return

      runCanvasMutation((canvas) => {
        const objects = [...groupObject.getObjects()]
        if (!objects.length) return

        canvas.discardActiveObject()
        objects.forEach((object) => {
          groupObject.remove(object)
          ensureObjectMeta(object)
          object.set({
            selectable: activeTool === 'select',
            evented: activeTool === 'select'
          })
          canvas.add(object)
        })

        canvas.remove(groupObject)

        if (activeTool === 'select') {
          if (objects.length > 1) {
            const nextSelection = new fabric.ActiveSelection(objects, { canvas })
            canvas.setActiveObject(nextSelection)
          } else if (objects[0]) {
            canvas.setActiveObject(objects[0])
          }
        }
      })

      setLayerContextMenu(null)
    },
    [activeTool, ensureObjectMeta, runCanvasMutation]
  )

  const bringLayerToFront = useCallback(
    (object) => {
      if (!object) return

      runCanvasMutation((canvas) => {
        canvas.bringObjectToFront(object)
        canvas.setActiveObject(object)
      })
      setLayerContextMenu(null)
    },
    [runCanvasMutation]
  )

  const openLayerContextMenu = useCallback(
    (event, layer) => {
      if (!layer?.ref) return

      event.preventDefault?.()
      event.stopPropagation?.()

      const canvas = fabricCanvas.current
      const currentActive = canvas?.getActiveObject()
      if (!isActiveSelection(currentActive) || !currentActive.getObjects().includes(layer.ref)) {
        canvas?.setActiveObject(layer.ref)
        canvas?.requestRenderAll()
        updateStore()
      }

      setLayerContextMenu({
        layerId: layer.id,
        x: clamp(event.clientX, 12, window.innerWidth - 220),
        y: clamp(event.clientY, 12, window.innerHeight - 220)
      })
    },
    [updateStore]
  )

  const sendLayerToBack = useCallback(
    (object) => {
      if (!object) return

      runCanvasMutation((canvas) => {
        canvas.sendObjectToBack(object)
        canvas.setActiveObject(object)
      })
      setLayerContextMenu(null)
    },
    [runCanvasMutation]
  )

  const toggleLayerVisibility = useCallback(
    (layer) => {
      const object = layer?.ref
      if (!object) return

      runCanvasMutation((canvas) => {
        const nextVisible = object.visible === false
        object.set('visible', nextVisible)
        if (!nextVisible && canvas.getActiveObject() === object) {
          canvas.discardActiveObject()
        }
      })
    },
    [runCanvasMutation]
  )

  const toggleLayerLock = useCallback(
    (layer) => {
      const object = layer?.ref
      if (!object) return

      runCanvasMutation(() => {
        applyLockState(object, !object.locked)
      })
    },
    [runCanvasMutation]
  )

  const setZoomLevel = useCallback((value) => {
    const next = clamp(value, MIN_ZOOM, MAX_ZOOM)
    zoomRef.current = next
    setZoom(next)
  }, [])

  const fitToScreen = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const fitZoom = Math.min(
      (viewport.clientWidth - FIT_PADDING) / size.w,
      (viewport.clientHeight - FIT_PADDING) / size.h
    )
    setZoomLevel(Math.min(fitZoom, 1))
    viewport.scrollLeft = 0
    viewport.scrollTop = 0
  }, [setZoomLevel, size.h, size.w])

  const copySelection = useCallback(async () => {
    const active = fabricCanvas.current?.getActiveObject()
    if (!active) return false

    clipboardRef.current = await active.clone(CUSTOM_SERIALIZATION_FIELDS)
    navigator.clipboard?.writeText(' ')?.catch(() => undefined)
    return true
  }, [])

  const cutSelection = useCallback(async () => {
    const active = fabricCanvas.current?.getActiveObject()
    if (!active) return

    if (await copySelection()) {
      removeLayer(active)
    }
  }, [copySelection, removeLayer])

  const pasteSelection = useCallback(async () => {
    const source = clipboardRef.current
    if (!source || !fabricCanvas.current) return

    const clone = await source.clone(CUSTOM_SERIALIZATION_FIELDS)
    assignFreshIds(clone)
    source.set({ left: (source.left || 0) + 20, top: (source.top || 0) + 20 })
    clone.set({ left: source.left, top: source.top })

    const isSelect = activeToolRef.current === 'select'
    const prepare = (object) => {
      ensureObjectMeta(object, fabricCanvas.current.getObjects().length)
      object.set({ selectable: isSelect, evented: isSelect })
    }

    runCanvasMutation((canvas) => {
      canvas.discardActiveObject()

      if (isActiveSelection(clone)) {
        clone.canvas = canvas
        clone.forEachObject((object) => {
          prepare(object)
          canvas.add(object)
        })
        clone.setCoords()
      } else {
        prepare(clone)
        canvas.add(clone)
      }

      if (isSelect) {
        canvas.setActiveObject(clone)
      }
    })
  }, [ensureObjectMeta, runCanvasMutation])

  const selectAllLayers = useCallback(() => {
    const canvas = fabricCanvas.current
    if (!canvas) return

    const objects = canvas.getObjects().filter((object) => object.visible !== false)
    if (!objects.length) return

    canvas.discardActiveObject()
    canvas.setActiveObject(
      objects.length === 1 ? objects[0] : new fabric.ActiveSelection(objects, { canvas })
    )
    canvas.requestRenderAll()
  }, [])

  const nudgeSelection = useCallback((deltaX, deltaY) => {
    const canvas = fabricCanvas.current
    const active = canvas?.getActiveObject()
    if (!canvas || !active || active.locked) return

    active.set({ left: (active.left || 0) + deltaX, top: (active.top || 0) + deltaY })
    active.setCoords()
    canvas.requestRenderAll()
    canvas.fire('object:modified', { target: active })
  }, [])

  useEffect(() => {
    if (init) fitToScreen()
  }, [fitToScreen, init])

  useEffect(() => {
    if (!init) return

    const handlePaste = (event) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))
      ) {
        return
      }
      if (fabricCanvas.current?.getActiveObject()?.isEditing) return

      const imageFile = Array.from(event.clipboardData?.files || []).find((file) =>
        file.type.startsWith('image/')
      )
      if (imageFile) {
        event.preventDefault()
        addImageFromFile(imageFile)
        return
      }

      if (clipboardRef.current) {
        event.preventDefault()
        pasteSelection()
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [addImageFromFile, init, pasteSelection])

  useEffect(() => {
    const handleDragOver = (event) => event.preventDefault()

    const handleDrop = (event) => {
      event.preventDefault()
      const files = Array.from(event.dataTransfer?.files || [])

      const projectFile = files.find((file) => file.name.toLowerCase().endsWith('.rdesign'))
      if (projectFile) {
        const filePath = window.electronAPI?.getPathForFile?.(projectFile)
        if (filePath) openProjectRef.current?.(filePath)
        return
      }

      if (init) files.forEach(addImageFromFile)
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [addImageFromFile, init])

  const alignSelection = useCallback((mode) => {
    const canvas = fabricCanvas.current
    const active = canvas?.getActiveObject()
    if (!canvas || !active || active.locked) return

    const rect = active.getBoundingRect()
    let deltaX = 0
    let deltaY = 0

    if (mode === 'left') deltaX = -rect.left
    if (mode === 'center-x') deltaX = canvas.width / 2 - (rect.left + rect.width / 2)
    if (mode === 'right') deltaX = canvas.width - (rect.left + rect.width)
    if (mode === 'top') deltaY = -rect.top
    if (mode === 'center-y') deltaY = canvas.height / 2 - (rect.top + rect.height / 2)
    if (mode === 'bottom') deltaY = canvas.height - (rect.top + rect.height)

    active.set({ left: (active.left || 0) + deltaX, top: (active.top || 0) + deltaY })
    active.setCoords()
    canvas.requestRenderAll()
    canvas.fire('object:modified', { target: active })
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadBootstrapData = async () => {
      if (!window.electronAPI?.getBootstrapData) {
        bootstrapReadyRef.current = true
        return
      }

      try {
        const data = await window.electronAPI.getBootstrapData()
        if (cancelled) return

        const nextSettings = { ...DEFAULT_SETTINGS, ...(data?.settings || {}) }
        const nextAppInfo = {
          ...DEFAULT_APP_INFO,
          ...(data?.appInfo || {}),
          links: data?.appInfo?.links?.length ? data.appInfo.links : DEFAULT_LINKS
        }

        setSettingsState(nextSettings)
        setBrushColor(nextSettings.defaultColor)
        setSystemFonts(
          uniqueFonts(data?.systemFonts?.length ? data.systemFonts : RECOMMENDED_FONTS)
        )
        setAppInfo(nextAppInfo)
        setRecentProjects(Array.isArray(data?.recentProjects) ? data.recentProjects : [])

        if (data?.initialProjectPath) {
          openProjectRef.current?.(data.initialProjectPath)
        }
      } catch (error) {
        console.error('Failed to load bootstrap data:', error)
      } finally {
        if (!cancelled) {
          bootstrapReadyRef.current = true
        }
      }
    }

    loadBootstrapData()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    snapSettingsRef.current = {
      enabled: Boolean(settingsState.snapEnabled),
      tolerance: Math.max(1, Number.parseFloat(settingsState.snapTolerance) || 1)
    }
  }, [settingsState.snapEnabled, settingsState.snapTolerance])

  useEffect(() => {
    if (!bootstrapReadyRef.current || !window.electronAPI?.saveSettings) return

    const timeoutId = setTimeout(() => {
      window.electronAPI.saveSettings(settingsState).catch?.((error) => {
        console.error('Failed to save settings:', error)
      })
    }, 180)

    return () => clearTimeout(timeoutId)
  }, [settingsState])

  useEffect(() => {
    projectAppearanceRef.current = {
      backgroundColor: currentProject.backgroundColor || '#ffffff',
      transparentBackground: Boolean(currentProject.transparentBackground)
    }

    const canvas = fabricCanvas.current
    if (!canvas || !init) return

    canvas.backgroundColor = projectAppearanceRef.current.transparentBackground
      ? 'rgba(0,0,0,0)'
      : projectAppearanceRef.current.backgroundColor
    canvas.requestRenderAll()
  }, [currentProject.backgroundColor, currentProject.transparentBackground, init])

  useEffect(() => {
    if (!window.electronAPI?.onAppCloseRequested) return

    return window.electronAPI.onAppCloseRequested(async () => {
      try {
        const dirtyTabs = tabsRef.current.filter(
          (tab) => tab.id !== activeTabIdRef.current && tab.dirty
        )
        for (const tab of dirtyTabs) {
          const tabResult = await saveInactiveTab(tab)
          if (!tabResult?.saved) {
            window.electronAPI.cancelAppClose?.()
            return
          }
        }

        const result = projectStateRef.current.dirty
          ? await handleSaveProject({ keepMenuOpen: true })
          : { saved: true }
        if (result?.saved) {
          window.electronAPI.confirmAppClose?.()
        } else if (!result?.canceled) {
          alert('Не удалось сохранить проект. Закрытие отменено.')
          window.electronAPI.cancelAppClose?.()
        } else {
          window.electronAPI.cancelAppClose?.()
        }
      } catch (error) {
        console.error('Failed to save on close:', error)
        alert('Не удалось сохранить проект. Закрытие отменено.')
        window.electronAPI.cancelAppClose?.()
      }
    })
  }, [handleSaveProject, saveInactiveTab])

  useEffect(() => {
    if (!window.electronAPI?.onOpenFilePath) return

    return window.electronAPI.onOpenFilePath((filePath) => {
      if (filePath) {
        handleOpenProject(filePath)
      }
    })
  }, [handleOpenProject])

  useEffect(() => {
    const appName = appInfo.name || DEFAULT_APP_INFO.name

    if (!init) {
      document.title = appName
      return
    }

    const projectName = currentProject.name || DEFAULT_PROJECT.name
    document.title = `${appName} - ${projectName}${projectStatus.dirty ? ' *' : ''}`
  }, [appInfo.name, currentProject.name, init, projectStatus.dirty])

  useEffect(() => {
    const handleResizeMove = (event) => {
      const state = resizeStateRef.current
      if (!state) return

      if (state.type === 'sidebar') {
        const maxWidth = clamp(window.innerWidth - 220, 260, 520)
        const nextWidth = clamp(state.sidebarWidth + (state.startX - event.clientX), 260, maxWidth)

        setSettingsState((current) => ({
          ...current,
          sidebarWidth: nextWidth
        }))
      }

      if (state.type === 'layer-split') {
        const maxHeight = clamp(window.innerHeight - 220, 260, 560)
        const nextHeight = clamp(
          state.layerPanelHeight + (event.clientY - state.startY),
          220,
          maxHeight
        )

        setSettingsState((current) => ({
          ...current,
          layerPanelHeight: nextHeight
        }))
      }

      if (state.type === 'font-menu') {
        const nextHeight = clamp(state.fontMenuHeight + (state.startY - event.clientY), 240, 720)

        setSettingsState((current) => ({
          ...current,
          fontMenuHeight: nextHeight
        }))
      }
    }

    const stopResize = () => {
      if (!resizeStateRef.current) return
      resizeStateRef.current = null
      document.body.classList.remove('app-resizing')
    }

    window.addEventListener('mousemove', handleResizeMove)
    window.addEventListener('mouseup', stopResize)

    return () => {
      window.removeEventListener('mousemove', handleResizeMove)
      window.removeEventListener('mouseup', stopResize)
      document.body.classList.remove('app-resizing')
    }
  }, [])

  useEffect(() => {
    const handleKeys = (event) => {
      const isModifierPressed = event.ctrlKey || event.metaKey
      const target = event.target
      const isFormField =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))
      const isCanvasTextEditing = Boolean(fabricCanvas.current?.getActiveObject()?.isEditing)

      if (!isModifierPressed && event.code === 'Space' && !isFormField && !isCanvasTextEditing) {
        event.preventDefault()
        spacePressedRef.current = true
      }

      if (isModifierPressed && event.code === 'Space') {
        event.preventDefault()
        toggleAppMenu()
        return
      }

      if (isModifierPressed && event.code === 'KeyW') {
        event.preventDefault()
        if (activeTabIdRef.current) closeTab(activeTabIdRef.current)
        return
      }

      if (isModifierPressed && event.key === 'Tab') {
        event.preventDefault()
        const list = tabsRef.current
        const index = list.findIndex((tab) => tab.id === activeTabIdRef.current)
        if (list.length > 1 && index >= 0) {
          const step = event.shiftKey ? -1 : 1
          switchTab(list[(index + step + list.length) % list.length].id)
        }
        return
      }

      if (isModifierPressed && event.code === 'KeyO' && !isFormField && !isCanvasTextEditing) {
        event.preventDefault()
        handleOpenProject()
        return
      }

      if (isModifierPressed && event.code === 'KeyN' && !isFormField && !isCanvasTextEditing) {
        event.preventDefault()
        handleCreateProject()
        return
      }

      if (isModifierPressed && event.code === 'KeyS') {
        event.preventDefault()
        if (init && window.electronAPI) {
          if (event.shiftKey) {
            handleSaveProject({ saveAs: true })
          } else {
            handleSaveProject()
          }
        }
        return
      }

      if (event.key === 'Escape') {
        closeAppMenu()
        setSettingsOpen(false)
        setFontPickerOpen(false)
        setBrushSettingsOpen(false)
        setLayerContextMenu(null)
        return
      }

      if (!init) return
      if (isFormField || isCanvasTextEditing) return

      if (!isModifierPressed && event.code === 'KeyV') {
        setActiveTool('select')
        return
      }

      if (!isModifierPressed && event.code === 'KeyP') {
        setActiveTool('pencil')
        return
      }

      if (!isModifierPressed && event.code === 'KeyB') {
        setActiveTool('fill')
        return
      }

      if (isModifierPressed && !event.shiftKey && event.code === 'KeyD') {
        event.preventDefault()
        const active = fabricCanvas.current?.getActiveObject()
        if (active && !isActiveSelection(active)) {
          duplicateLayer(active)
        }
        return
      }

      if (isModifierPressed && !event.shiftKey && event.code === 'KeyC') {
        event.preventDefault()
        copySelection()
        return
      }

      if (isModifierPressed && !event.shiftKey && event.code === 'KeyX') {
        event.preventDefault()
        cutSelection()
        return
      }

      if (isModifierPressed && event.code === 'KeyA') {
        event.preventDefault()
        if (activeToolRef.current === 'select') selectAllLayers()
        return
      }

      if (isModifierPressed && event.code === 'Digit0') {
        event.preventDefault()
        fitToScreen()
        return
      }

      if (isModifierPressed && event.code === 'Digit1') {
        event.preventDefault()
        setZoomLevel(1)
        return
      }

      if (isModifierPressed && (event.code === 'Equal' || event.code === 'NumpadAdd')) {
        event.preventDefault()
        setZoomLevel(zoomRef.current * 1.25)
        return
      }

      if (isModifierPressed && (event.code === 'Minus' || event.code === 'NumpadSubtract')) {
        event.preventDefault()
        setZoomLevel(zoomRef.current / 1.25)
        return
      }

      if (isModifierPressed && event.code === 'KeyG') {
        event.preventDefault()
        const active = fabricCanvas.current?.getActiveObject()
        if (event.shiftKey) {
          if (isGroupObject(active)) {
            ungroupLayer(active)
          }
        } else if (isActiveSelection(active)) {
          groupSelectedLayers()
        }
        return
      }

      if (isModifierPressed && !event.shiftKey && event.code === 'KeyZ') {
        event.preventDefault()
        handleUndo()
        return
      }

      if (
        isModifierPressed &&
        (event.code === 'KeyY' || (event.shiftKey && event.code === 'KeyZ'))
      ) {
        event.preventDefault()
        handleRedo()
        return
      }

      const arrowDelta = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1]
      }[event.code]
      if (arrowDelta && !isModifierPressed && fabricCanvas.current?.getActiveObject()) {
        event.preventDefault()
        const step = event.shiftKey ? NUDGE_STEP_FAST : NUDGE_STEP
        nudgeSelection(arrowDelta[0] * step, arrowDelta[1] * step)
        return
      }

      if (event.code === 'Delete' || event.code === 'Backspace') {
        const canvas = fabricCanvas.current
        if (!canvas) return
        const active = canvas.getActiveObject()
        if (!active) return
        event.preventDefault()
        removeLayer(active)
      }
    }

    const handleKeyUp = (event) => {
      if (event.code === 'Space') {
        spacePressedRef.current = false
        if (isPanningRef.current) {
          isPanningRef.current = false
          setIsPanning(false)
        }
      }
    }

    const handleWindowBlur = () => {
      spacePressedRef.current = false
      if (isPanningRef.current) {
        isPanningRef.current = false
        setIsPanning(false)
      }
    }

    window.addEventListener('keydown', handleKeys)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('keydown', handleKeys)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [
    closeAppMenu,
    closeTab,
    copySelection,
    cutSelection,
    duplicateLayer,
    fitToScreen,
    groupSelectedLayers,
    handleCreateProject,
    handleOpenProject,
    handleRedo,
    handleSaveProject,
    handleUndo,
    init,
    nudgeSelection,
    removeLayer,
    selectAllLayers,
    setZoomLevel,
    switchTab,
    toggleAppMenu,
    ungroupLayer
  ])

  useEffect(() => {
    if (!init) return

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: size.w,
      height: size.h,
      backgroundColor: projectAppearanceRef.current.transparentBackground
        ? 'rgba(0,0,0,0)'
        : projectAppearanceRef.current.backgroundColor || '#ffffff',
      preserveObjectStacking: true,
      fireRightClick: true,
      stopContextMenu: true,
      selectionKey: ['shiftKey', 'ctrlKey', 'metaKey']
    })

    fabricCanvas.current = canvas

    const drawGuideLines = () => {
      if (!guideLinesRef.current.length) return

      const ctx = canvas.getTopContext()
      ctx.save()
      ctx.lineWidth = 1
      ctx.strokeStyle = '#a250ff'
      ctx.setLineDash([6, 4])

      guideLinesRef.current.forEach((line) => {
        ctx.beginPath()
        if (line.orientation === 'vertical') {
          ctx.moveTo(line.value, 0)
          ctx.lineTo(line.value, canvas.height)
        } else {
          ctx.moveTo(0, line.value)
          ctx.lineTo(canvas.width, line.value)
        }
        ctx.stroke()
      })

      ctx.setLineDash([])
      ctx.restore()
    }

    const handleMutation = () => {
      if (isRestoringRef.current || batchMutationRef.current) return
      resetSnapLocks()
      clearGuideLines(false)
      queueHistoryCommit()
      updateStore()
    }

    canvas.on({
      'object:added': handleMutation,
      'object:removed': handleMutation,
      'object:modified': handleMutation,
      'path:created': handleMutation,
      'text:changed': handleMutation,
      'selection:created': updateStore,
      'selection:updated': updateStore,
      'selection:cleared': updateStore
    })

    canvas.on('before:render', () => {
      canvas.clearContext(canvas.getTopContext())
    })

    canvas.on('after:render', drawGuideLines)

    canvas.on('object:moving', (event) => {
      const object = event.target
      if (!object) return

      const snapSettings = snapSettingsRef.current

      if (!snapSettings.enabled || event.e?.ctrlKey || event.e?.metaKey) {
        resetSnapLocks(object.id)
        clearGuideLines(true)
        canvas.requestRenderAll()
        return
      }

      const tolerance = snapSettings.tolerance
      const metrics = getObjectMetrics(object)
      const xPoints = [
        { id: 'left', value: metrics.left },
        { id: 'center', value: metrics.centerX },
        { id: 'right', value: metrics.right }
      ]
      const yPoints = [
        { id: 'top', value: metrics.top },
        { id: 'center', value: metrics.centerY },
        { id: 'bottom', value: metrics.bottom }
      ]
      const xCandidates = [
        { id: 'canvas:left', value: 0 },
        { id: 'canvas:center', value: canvas.width / 2 },
        { id: 'canvas:right', value: canvas.width }
      ]
      const yCandidates = [
        { id: 'canvas:top', value: 0 },
        { id: 'canvas:center', value: canvas.height / 2 },
        { id: 'canvas:bottom', value: canvas.height }
      ]

      canvas.getObjects().forEach((otherObject) => {
        if (otherObject === object || !otherObject.visible) return

        const otherMetrics = getObjectMetrics(otherObject)
        xCandidates.push(
          { id: `${otherObject.id}:left`, value: otherMetrics.left },
          { id: `${otherObject.id}:center`, value: otherMetrics.centerX },
          { id: `${otherObject.id}:right`, value: otherMetrics.right }
        )
        yCandidates.push(
          { id: `${otherObject.id}:top`, value: otherMetrics.top },
          { id: `${otherObject.id}:center`, value: otherMetrics.centerY },
          { id: `${otherObject.id}:bottom`, value: otherMetrics.bottom }
        )
      })

      const bestX = resolveSnapCandidate('x', object, xPoints, xCandidates, tolerance)
      const bestY = resolveSnapCandidate('y', object, yPoints, yCandidates, tolerance)

      guideLinesRef.current = []

      shiftObjectByDelta(object, bestX?.diff || 0, bestY?.diff || 0)

      if (bestX) {
        guideLinesRef.current.push({ orientation: 'vertical', value: bestX.value })
      }

      if (bestY) {
        guideLinesRef.current.push({ orientation: 'horizontal', value: bestY.value })
      }

      object.setCoords?.()
      canvas.requestRenderAll()
    })

    canvas.on('mouse:down', () => {
      const movingObject = canvas.getActiveObject()
      resetSnapLocks(movingObject?.id || null)
    })

    canvas.on('mouse:up', () => {
      resetSnapLocks()
      clearGuideLines(true)
    })
    canvas.on('mouse:wheel', (event) => {
      if (!event.e.ctrlKey && !event.e.metaKey) return
      const delta = event.e.deltaY
      let nextZoom = zoomRef.current * 0.999 ** delta

      nextZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)

      zoomRef.current = nextZoom
      setZoom(nextZoom)
      event.e.preventDefault()
      event.e.stopPropagation()
    })

    const pendingSnapshot = pendingProjectRef.current
    if (pendingSnapshot) {
      isRestoringRef.current = true
      canvas
        .loadFromJSON(pendingSnapshot)
        .then(() => {
          if (fabricCanvas.current !== canvas) return
          hydrateCanvasObjects(canvas)
          canvas.backgroundColor = projectAppearanceRef.current.transparentBackground
            ? 'rgba(0,0,0,0)'
            : projectAppearanceRef.current.backgroundColor || '#ffffff'
          canvas.renderAll()
          requestAnimationFrame(() => canvas.requestRenderAll())
          canvas.calcOffset?.()
          pendingProjectRef.current = null
          isRestoringRef.current = false
          const restoredHistory = pendingHistoryRef.current
          pendingHistoryRef.current = null
          if (restoredHistory) {
            historyRef.current = restoredHistory
            syncHistoryCounters()
          } else {
            resetHistoryFromCanvas()
          }
          const restoredDirty = pendingDirtyRef.current
          pendingDirtyRef.current = false
          updateStore()
          syncProjectState({
            dirty: restoredDirty,
            hasContent: Boolean(canvas.getObjects().length)
          })
        })
        .catch((error) => {
          console.error('Failed to load project snapshot:', error)
          pendingProjectRef.current = null
          isRestoringRef.current = false
        })
    } else {
      canvas.renderAll()
      requestAnimationFrame(() => canvas.requestRenderAll())
      resetHistoryFromCanvas()
      updateStore()
      syncProjectState({ dirty: false, hasContent: false })
    }

    return () => {
      if (historyTimeoutRef.current) {
        clearTimeout(historyTimeoutRef.current)
        historyTimeoutRef.current = null
      }

      guideLinesRef.current = []
      fabricCanvas.current = null
      canvas.dispose()
    }
  }, [
    clearGuideLines,
    hydrateCanvasObjects,
    init,
    queueHistoryCommit,
    resetSnapLocks,
    resetHistoryFromCanvas,
    resolveSnapCandidate,
    size.h,
    size.w,
    updateStore,
    syncHistoryCounters,
    syncProjectState
  ])

  useEffect(() => {
    const canvas = fabricCanvas.current
    if (!canvas || !init) return

    const isSelectTool = activeTool === 'select'
    const isPencilTool = activeTool === 'pencil'
    const isFillTool = activeTool === 'fill'

    canvas.isDrawingMode = isPencilTool
    canvas.selection = isSelectTool
    canvas.selectionKey = ['shiftKey', 'ctrlKey', 'metaKey']
    canvas.fireRightClick = true
    canvas.stopContextMenu = true
    canvas.skipTargetFind = isFillTool
    canvas.defaultCursor = isFillTool ? 'crosshair' : isPencilTool ? 'crosshair' : 'default'

    canvas.forEachObject((object) => {
      object.selectable = isSelectTool
      object.evented = isSelectTool
      object.hoverCursor = isFillTool ? 'crosshair' : 'move'
    })

    if (!isSelectTool) {
      canvas.discardActiveObject()
      clearGuideLines(true)
    }

    const onFillClick = (event) => {
      if (!isFillTool) return

      const target = findFillTarget(canvas, event.e)
      if (!target) return

      const changed = applyColorToObject(target, brushColor)
      if (!changed) return

      canvas.discardActiveObject()
      canvas.requestRenderAll()
      commitCanvasState()
      event.e.preventDefault?.()
      event.e.stopPropagation?.()
    }

    canvas.on('mouse:down', onFillClick)
    canvas.requestRenderAll()

    return () => {
      canvas.off('mouse:down', onFillClick)
      canvas.skipTargetFind = false
    }
  }, [activeTool, brushColor, clearGuideLines, commitCanvasState, init])

  useEffect(() => {
    const canvas = fabricCanvas.current
    if (!canvas || !init || activeTool !== 'pencil') return

    canvas.freeDrawingBrush = createConfiguredBrush(canvas, {
      type: settingsState.brushType,
      color: brushColor,
      size: settingsState.brushSize,
      opacity: settingsState.brushOpacity,
      seed: settingsState.brushSeed,
      smoothing: settingsState.brushSmoothing
    })
  }, [
    activeTool,
    brushColor,
    init,
    settingsState.brushOpacity,
    settingsState.brushSeed,
    settingsState.brushSize,
    settingsState.brushSmoothing,
    settingsState.brushType
  ])

  useEffect(() => {
    if (!activeTextObject) {
      setFontPickerOpen(false)
    }
  }, [activeId, activeTextObject])

  useEffect(() => {
    if (activeTool !== 'pencil') {
      setBrushSettingsOpen(false)
    }
  }, [activeTool])

  useEffect(() => {
    if (!activeObject || isActiveSelection(activeObject)) return
    setStyleNameDraft(activeObject.name || 'Новый стиль')
  }, [activeId, activeObject])

  useEffect(() => {
    if (!fontPickerOpen) {
      setFontSearch('')
    }
  }, [fontPickerOpen])

  useEffect(() => {
    if (!layerContextMenu) return

    const targetExists = layers.some((layer) => layer.id === layerContextMenu.layerId)
    if (!targetExists) {
      setLayerContextMenu(null)
    }
  }, [layerContextMenu, layers])

  useEffect(() => {
    if (!fontPickerOpen) return

    const handleOutsideClick = (event) => {
      const menuElement = fontMenuRef.current
      const buttonElement = fontMenuButtonRef.current
      if (menuElement?.contains(event.target) || buttonElement?.contains(event.target)) return
      setFontPickerOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [fontPickerOpen])

  useEffect(() => {
    if (!brushSettingsOpen) return

    const handleOutsideClick = (event) => {
      const panelElement = brushSettingsRef.current
      const buttonElement = brushSettingsButtonRef.current
      if (panelElement?.contains(event.target) || buttonElement?.contains(event.target)) return
      setBrushSettingsOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [brushSettingsOpen])

  useEffect(() => {
    if (!floatingPanelOpen) return

    const handleOutsideClick = (event) => {
      const panelElement = floatingPanelRef.current
      const buttonElement = floatingPanelButtonRef.current
      if (panelElement?.contains(event.target) || buttonElement?.contains(event.target)) return
      setFloatingPanelOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [floatingPanelOpen])

  return (
    <div
      className="app-shell"
      style={{
        '--sidebar-width': `${sidebarWidth}px`,
        '--layer-panel-height': `${layerPanelHeight}px`
      }}
    >
      {!init && tabs.length === 0 && (
        <div className="start-screen">
          <div className="start-container">
            <header className="start-header">
              <div className="start-brand-row">
                <img src={appIcon} alt="Raytolfas" className="start-brand-icon" />
                <h1 className="start-app-title">{appInfo.name}</h1>
              </div>

              <div className="start-actions">
                <button
                  className="start-primary-btn"
                  onClick={() => {
                    const nextSize = normalizeSize(draftSize)
                    setDraftSize(nextSize)
                    openProjectSetup({
                      width: nextSize.w,
                      height: nextSize.h
                    })
                  }}
                >
                  <FilePlus size={18} />
                  <span>{t('start.create')}</span>
                </button>
                <button className="start-secondary-btn" onClick={() => handleOpenProject()}>
                  <FolderOpen size={18} />
                  <span>{t('start.open')}</span>
                </button>
              </div>
            </header>

            <section className="start-recent-section">
              <div className="start-recent-head">
                <h2>{t('start.recentProjects')}</h2>
              </div>

              <div className="start-recent-list">
                {recentProjects.length === 0 && (
                  <div className="start-empty-state">
                    <p>{t('start.emptyRecent')}</p>
                  </div>
                )}

                {recentProjects.map((project) => (
                  <button
                    key={project.path}
                    className="start-recent-item"
                    onClick={() => handleOpenProject(project.path)}
                  >
                    <span className="start-recent-name">{project.name}</span>
                    <span className="start-recent-path">{project.path}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      <aside className="toolbar">
        <button className="tool-btn tool-btn-logo" onClick={toggleAppMenu} title={t('toolbar.menu')}>
          <img src={appIcon} alt="Raytolfas" className="tool-logo" />
        </button>
        <div className="toolbar-divider toolbar-divider-logo" />

        <button
          className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`}
          onClick={() => setActiveTool('select')}
          title={t('toolbar.select')}
        >
          <MousePointer2 size={20} />
        </button>
        <button
          className={`tool-btn ${activeTool === 'pencil' ? 'active' : ''}`}
          onClick={() => setActiveTool('pencil')}
          title={t('toolbar.pencil')}
        >
          <Pencil size={20} />
        </button>
        <button
          className={`tool-btn ${activeTool === 'fill' ? 'active' : ''}`}
          onClick={() => setActiveTool('fill')}
          title={t('toolbar.fill')}
        >
          <PaintBucket size={20} />
        </button>
        <div className="toolbar-divider" />
        <button className="tool-btn" onClick={() => addObj('rect')} title={t('toolbar.rect')}>
          <Square size={20} />
        </button>
        <button className="tool-btn" onClick={() => addObj('circle')} title={t('toolbar.circle')}>
          <Circle size={20} />
        </button>
        <button className="tool-btn" onClick={() => addObj('line')} title={t('toolbar.line')}>
          <Minus size={20} />
        </button>
        <button className="tool-btn" onClick={() => addObj('text')} title={t('toolbar.text')}>
          <Type size={20} />
        </button>
        <button
          className="tool-btn"
          onClick={addImageToCanvas}
          title={t('toolbar.image')}
          disabled={!init}
        >
          <Image size={20} />
        </button>

        <div style={{ flex: 1 }} />
        <div className="toolbar-divider" />

        <button
          className="tool-btn"
          onClick={handleUndo}
          disabled={historyState.undo === 0}
          title={t('toolbar.undo')}
        >
          <Undo2 size={20} />
        </button>
        <button
          className="tool-btn"
          onClick={handleRedo}
          disabled={historyState.redo === 0}
          title={t('toolbar.redo')}
        >
          <Redo2 size={20} />
        </button>
        <div className="toolbar-divider" />
        <button
          className="tool-btn tool-btn-danger"
          onClick={() => removeLayer(fabricCanvas.current?.getActiveObject())}
          title={t('toolbar.delete')}
        >
          <Trash2 size={20} />
        </button>
      </aside>

      {tabs.length > 0 && (
        <div className="tab-bar">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const tabName = isActive ? currentProject.name : tab.name
            const tabDirty = isActive ? projectStatus.dirty : tab.dirty

            return (
              <div
                key={tab.id}
                className={`tab-item ${isActive ? 'active' : ''}`}
                onClick={() => switchTab(tab.id)}
                onAuxClick={(event) => {
                  if (event.button === 1) {
                    event.preventDefault()
                    closeTab(tab.id)
                  }
                }}
                title={tabName}
              >
                <span className="tab-name">{tabName}</span>
                {tabDirty && <span className="tab-dirty" />}
                <button
                  className="tab-close"
                  onClick={(event) => {
                    event.stopPropagation()
                    closeTab(tab.id)
                  }}
                  title={t('tabs.close')}
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
          <button className="tab-add" onClick={handleCreateProject} title={t('tabs.new')}>
            <Plus size={14} />
          </button>
        </div>
      )}

      <main
        className={`viewport ${isPanning ? 'panning' : ''}`}
        ref={viewportRef}
        onMouseDown={(event) => {
          if (!init || !artboardRef.current || !fabricCanvas.current) return

          if (event.button === 1 || (event.button === 0 && spacePressedRef.current)) {
            isPanningRef.current = true
            setIsPanning(true)
            panStartRef.current = {
              x: event.clientX + event.currentTarget.scrollLeft,
              y: event.clientY + event.currentTarget.scrollTop
            }
            event.currentTarget.setPointerCapture?.(event.pointerId)
            event.preventDefault()
            return
          }

          const artboard = artboardRef.current.getBoundingClientRect()
          const { clientX, clientY } = event
          const viewportRect = event.currentTarget.getBoundingClientRect()

          if (
            clientX - viewportRect.left >= event.currentTarget.clientWidth ||
            clientY - viewportRect.top >= event.currentTarget.clientHeight
          ) {
            return
          }

          if (
            clientX >= artboard.left &&
            clientX <= artboard.right &&
            clientY >= artboard.top &&
            clientY <= artboard.bottom
          ) {
            return
          }

          fabricCanvas.current.discardActiveObject()
          fabricCanvas.current.requestRenderAll()
        }}
        onMouseMove={(event) => {
          if (isPanningRef.current) {
            event.currentTarget.scrollLeft = panStartRef.current.x - event.clientX
            event.currentTarget.scrollTop = panStartRef.current.y - event.clientY
            return
          }
        }}
        onMouseUp={(event) => {
          if (isPanningRef.current) {
            isPanningRef.current = false
            setIsPanning(false)
            event.currentTarget.releasePointerCapture?.(event.pointerId)
            return
          }

          event.currentTarget.releasePointerCapture?.(event.pointerId)
        }}
        onMouseLeave={() => {
          if (isPanningRef.current) {
            isPanningRef.current = false
            setIsPanning(false)
          }
          spacePressedRef.current = false
        }}
      >
        {init && (
          <div
            className="viewport-stage"
            style={{
              width: size.w * zoom + VIEW_PADDING * 2,
              height: size.h * zoom + VIEW_PADDING * 2
            }}
          >
          <div
            className={`artboard-container ${settingsState.showGrid ? 'grid-enabled' : ''}`}
            ref={artboardRef}
            style={{
              left: VIEW_PADDING,
              top: VIEW_PADDING,
              transform: `scale(${zoom})`,
              width: size.w,
              height: size.h,
              '--grid-size': `${settingsState.gridSize}px`
            }}
            onContextMenu={(event) => {
              const canvas = fabricCanvas.current
              if (!canvas) return
              const target = canvas.findTarget(event.nativeEvent || event)
              if (target) {
                event.preventDefault()
                event.stopPropagation()
                const currentActive = canvas.getActiveObject()
                if (!isActiveSelection(currentActive) || !currentActive.getObjects().includes(target)) {
                  canvas.setActiveObject(target)
                  canvas.requestRenderAll()
                  updateStore()
                }
                const matchedLayer = layers.find((l) => l.ref === target || l.id === target.id)
                if (matchedLayer) {
                  openLayerContextMenu(event, matchedLayer)
                }
              }
            }}
          >
            <canvas ref={canvasRef} />
          </div>
          </div>
        )}
      </main>

      <div
        className="sidebar-resizer"
        onMouseDown={(event) => startResize('sidebar', event)}
        aria-hidden="true"
      />

      <aside className="sidebar">
        <div className="layer-params-block" style={{ height: layerPanelHeight }}>
          {activeTool === 'fill' && (
            <div className="param-row param-row-color">
              <label>{t('layers.toolColor')}</label>
              <input
                type="color"
                value={brushColor}
                onChange={(event) => setBrushColor(event.target.value)}
              />
            </div>
          )}

          <div className="sidebar-header-row">
            <p className="block-title">{t('layers.paramsTitle')}</p>
          </div>
          <div className="layer-params-scroll">
            {!activeObject && <p className="layer-params-empty">{t('layers.selectObject')}</p>}

            {activeObject && (
              <>
                <div className="align-row">
                  {[
                    ['left', AlignStartVertical, t('align.left')],
                    ['center-x', AlignCenterVertical, t('align.centerX')],
                    ['right', AlignEndVertical, t('align.right')],
                    ['top', AlignStartHorizontal, t('align.top')],
                    ['center-y', AlignCenterHorizontal, t('align.centerY')],
                    ['bottom', AlignEndHorizontal, t('align.bottom')]
                  ].map(([mode, Icon, title]) => (
                    <button
                      key={mode}
                      className="align-btn"
                      onClick={() => alignSelection(mode)}
                      title={title}
                    >
                      <Icon size={16} />
                    </button>
                  ))}
                </div>

                {isImageObject(activeObject) && (
                  <div className="param-action-box">
                    <button
                      className="param-action-btn"
                      onClick={() => handleVectorizeImage(activeObject, 'color')}
                      disabled={isVectorizing}
                    >
                      <Shapes size={15} />
                      <span>{isVectorizing ? t('layers.vectorizing') : t('layers.vectorize')}</span>
                    </button>
                    <button
                      className="param-action-btn secondary"
                      onClick={() => handleVectorizeImage(activeObject, 'bw')}
                      disabled={isVectorizing}
                    >
                      <span>{t('layers.vectorizeBw')}</span>
                    </button>
                    <button
                      className="param-action-btn"
                      onClick={handleRemoveBackground}
                      disabled={isRemovingBg}
                    >
                      <Sparkles size={15} />
                      <span>{isRemovingBg ? t('layers.removingBg') : t('layers.removeBg')}</span>
                    </button>
                    {activeObject.originalSrc && (
                      <button
                        className="param-action-btn secondary"
                        onClick={handleRestoreBackground}
                        disabled={isRemovingBg}
                      >
                        <span>{t('layers.restoreBg')}</span>
                      </button>
                    )}
                  </div>
                )}

                <div className="param-row">
                  <label>X</label>
                  <input
                    type="number"
                    value={Math.round(activeObject.left || 0)}
                    onChange={(event) =>
                      applyActiveObjectUpdate({ left: Number.parseFloat(event.target.value) || 0 })
                    }
                  />
                </div>
                <div className="param-row">
                  <label>Y</label>
                  <input
                    type="number"
                    value={Math.round(activeObject.top || 0)}
                    onChange={(event) =>
                      applyActiveObjectUpdate({ top: Number.parseFloat(event.target.value) || 0 })
                    }
                  />
                </div>
                <div className="param-row">
                  <label>{t('layers.opacity')}</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={(activeObject.opacity ?? 1) * 100}
                    onChange={(event) =>
                      applyActiveObjectUpdate({
                        opacity: (Number.parseFloat(event.target.value) || 0) / 100
                      })
                    }
                  />
                </div>
                <div className="param-row">
                  <label>{t('layers.blendMode')}</label>
                  <select
                    className="param-select"
                    value={activeObject.globalCompositeOperation || 'source-over'}
                    onChange={(event) =>
                      applyActiveObjectUpdate({
                        globalCompositeOperation: event.target.value
                      })
                    }
                  >
                    {BLEND_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {'fill' in activeObject && (
                  <div className="param-row">
                    <label>{t('layers.fill')}</label>
                    <input
                      type="color"
                      value={toInputColor(activeObject.fill, settingsState.defaultColor)}
                      onChange={(event) => applyActiveObjectUpdate({ fill: event.target.value })}
                    />
                  </div>
                )}
                {'stroke' in activeObject && activeObject.stroke != null && (
                  <div className="param-row">
                    <label>{t('layers.stroke')}</label>
                    <input
                      type="color"
                      value={toInputColor(activeObject.stroke, settingsState.defaultColor)}
                      onChange={(event) => applyActiveObjectUpdate({ stroke: event.target.value })}
                    />
                  </div>
                )}
                {activeObject.strokeWidth != null && (
                  <div className="param-row">
                    <label>{t('layers.thickness')}</label>
                    <input
                      type="number"
                      min="1"
                      value={Math.round(activeObject.strokeWidth || 1)}
                      onChange={(event) =>
                        applyActiveObjectUpdate({
                          strokeWidth: Math.max(1, Number.parseFloat(event.target.value) || 1)
                        })
                      }
                    />
                  </div>
                )}
                {activeObject.width != null && (
                  <div className="param-row">
                    <label>{t('layers.width')}</label>
                    <input
                      type="number"
                      min="1"
                      value={Math.round(activeObject.width * (activeObject.scaleX ?? 1))}
                      onChange={(event) => {
                        const nextWidth = Math.max(1, Number.parseFloat(event.target.value) || 1)
                        applyActiveObjectUpdate((object) => {
                          object.set('scaleX', nextWidth / (object.width || 1))
                        })
                      }}
                    />
                  </div>
                )}
                {activeObject.height != null && (
                  <div className="param-row">
                    <label>{t('layers.height')}</label>
                    <input
                      type="number"
                      min="1"
                      value={Math.round(activeObject.height * (activeObject.scaleY ?? 1))}
                      onChange={(event) => {
                        const nextHeight = Math.max(1, Number.parseFloat(event.target.value) || 1)
                        applyActiveObjectUpdate((object) => {
                          object.set('scaleY', nextHeight / (object.height || 1))
                        })
                      }}
                    />
                  </div>
                )}
                {activeObject.radius != null && (
                  <div className="param-row">
                    <label>{t('layers.radius')}</label>
                    <input
                      type="number"
                      min="1"
                      value={Math.round(activeObject.radius * (activeObject.scaleX ?? 1))}
                      onChange={(event) => {
                        const nextRadius = Math.max(1, Number.parseFloat(event.target.value) || 1)
                        applyActiveObjectUpdate((object) => {
                          const scale = nextRadius / (object.radius || 1)
                          object.set({ scaleX: scale, scaleY: scale })
                        })
                      }}
                    />
                  </div>
                )}
                {activeObject.angle != null && (
                  <div className="param-row">
                    <label>{t('layers.angle')}</label>
                    <input
                      type="number"
                      value={Math.round(activeObject.angle || 0)}
                      onChange={(event) =>
                        applyActiveObjectUpdate({
                          angle: Number.parseFloat(event.target.value) || 0
                        })
                      }
                    />
                  </div>
                )}
                {activeObject.rx != null && (
                  <div className="param-row">
                    <label>{t('layers.rounding')}</label>
                    <input
                      type="number"
                      min="0"
                      value={Math.round(activeObject.rx || 0)}
                      onChange={(event) => {
                        const nextRadius = Math.max(0, Number.parseFloat(event.target.value) || 0)
                        applyActiveObjectUpdate({ rx: nextRadius, ry: nextRadius })
                      }}
                    />
                  </div>
                )}
                {activeTextObject && (
                  <div className="param-row">
                    <label>{t('layers.font')}</label>
                    <button
                      className="param-font-btn"
                      onClick={() => {
                        setFontPickerOpen(true)
                      }}
                    >
                      {activeTextObject.fontFamily || 'Inter'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div
          className="sidebar-splitter"
          onMouseDown={(event) => startResize('layer-split', event)}
          aria-hidden="true"
        />

        <div className="sidebar-block sidebar-block-layers">
          <div className="sidebar-header-row">
            <p className="block-title">{t('layers.title')} ({layers.length})</p>
            <div className="layer-header-actions">
              <button
                className="layer-action-btn"
                onClick={groupSelectedLayers}
                disabled={!canGroupSelection}
                title={t('layers.group')}
              >
                {t('layers.group')}
              </button>
            </div>
          </div>
          {layers.map((layer, index) => {
            const isLayerSelected = selectedObjectIds.includes(layer.id)

            return (
              <div
                key={layer.id}
                className={`layer-row ${isLayerSelected ? 'active' : ''} ${
                  dragLayerId === layer.id ? 'dragging' : ''
                } ${dropIndex === index ? 'drop-target' : ''}`}
                draggable
                onContextMenu={(event) => openLayerContextMenu(event, layer)}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  startRenamingLayer(layer)
                }}
                onDragStart={(event) => {
                  setLayerContextMenu(null)
                  setDragLayerId(layer.id)
                  dragLayerRef.current = layer
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', layer.id)
                }}
                onDragEnd={() => {
                  setDragLayerId(null)
                  setDropIndex(null)
                  dragLayerRef.current = null
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDropIndex(index)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragLayerId(null)
                  setDropIndex(null)

                  const fromLayer =
                    dragLayerRef.current ||
                    layers.find((item) => item.id === event.dataTransfer.getData('text/plain'))

                  dragLayerRef.current = null
                  if (fromLayer && fromLayer.id !== layer.id) {
                    moveLayerToIndex(fromLayer.ref, index)
                  }
                }}
                onClick={(event) => handleLayerClick(layer, index, event)}
              >
                <GripVertical size={14} className="layer-grip" />
                <Box size={14} color="var(--brand)" />
                {editingLayerId === layer.id ? (
                  <input
                    className="layer-name-input"
                    value={editingLayerName}
                    autoFocus
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setEditingLayerName(event.target.value)}
                    onBlur={() => finishRenamingLayer(layer, editingLayerName)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        finishRenamingLayer(layer, editingLayerName)
                      } else if (event.key === 'Escape') {
                        setEditingLayerId(null)
                      }
                    }}
                  />
                ) : (
                  <span className="layer-name">{layer.name}</span>
                )}
                <button
                  className={`layer-toggle ${layer.visible ? '' : 'off'}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleLayerVisibility(layer)
                  }}
                  title={layer.visible ? t('layers.hide') : t('layers.show')}
                >
                  {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  className={`layer-toggle ${layer.locked ? 'on' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleLayerLock(layer)
                  }}
                  title={layer.locked ? t('layers.unlock') : t('layers.lock')}
                >
                  {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
                <button
                  className="layer-delete"
                  onClick={(event) => {
                    event.stopPropagation()
                    removeLayer(layer.ref)
                  }}
                  title={t('layers.delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      </aside>

      {layerContextMenu && (
        <div
          className="layer-context-overlay"
          onClick={() => setLayerContextMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault()
            setLayerContextMenu(null)
          }}
        >
          <div
            className="layer-context-menu"
            style={{ left: layerContextMenu.x, top: layerContextMenu.y }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.stopPropagation()}
          >
            {(() => {
              const targetLayer = layers.find((layer) => layer.id === layerContextMenu.layerId)
              if (!targetLayer?.ref) return null

              return (
                <>
                  <button
                    className="layer-context-item"
                    onClick={() => startRenamingLayer(targetLayer)}
                  >
                    {t('layers.rename')}
                  </button>
                  <button
                    className="layer-context-item"
                    onClick={() => duplicateLayer(targetLayer.ref)}
                  >
                    {t('layers.duplicate')}
                  </button>
                  {canGroupSelection && (
                    <button
                      className="layer-context-item"
                      onClick={groupSelectedLayers}
                    >
                      {t('layers.group')}
                    </button>
                  )}
                  <button
                    className="layer-context-item"
                    onClick={() => bringLayerToFront(targetLayer.ref)}
                  >
                    {t('layers.bringToFront')}
                  </button>
                  <button
                    className="layer-context-item"
                    onClick={() => sendLayerToBack(targetLayer.ref)}
                  >
                    {t('layers.sendToBack')}
                  </button>
                  {isGroupObject(targetLayer.ref) && (
                    <button
                      className="layer-context-item"
                      onClick={() => ungroupLayer(targetLayer.ref)}
                    >
                      {t('layers.ungroup')}
                    </button>
                  )}
                  {isImageObject(targetLayer.ref) && (
                    <>
                      <button
                        className="layer-context-item"
                        onClick={() => {
                          handleVectorizeImage(targetLayer.ref, 'color')
                        }}
                        disabled={isVectorizing}
                      >
                        {t('layers.vectorize')}
                      </button>
                      <button
                        className="layer-context-item"
                        onClick={() => {
                          handleVectorizeImage(targetLayer.ref, 'bw')
                        }}
                        disabled={isVectorizing}
                      >
                        {t('layers.vectorizeBw')}
                      </button>
                      <button
                        className="layer-context-item"
                        onClick={() => {
                          selectLayerObject(targetLayer.ref)
                          setLayerContextMenu(null)
                          handleRemoveBackground()
                        }}
                        disabled={isRemovingBg}
                      >
                        {t('layers.removeBg')}
                      </button>
                    </>
                  )}
                  <button
                    className="layer-context-item danger"
                    onClick={() => removeLayer(targetLayer.ref)}
                  >
                    {t('layers.delete')}
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {init && (
        <button
          ref={floatingPanelButtonRef}
          className={`floating-panel-launcher ${floatingPanelOpen ? 'active' : ''}`}
          onClick={() => {
            setFloatingPanelOpen((current) => !current)
            setFloatingPanelTab('styles')
          }}
          title={t('floating.title')}
        >
          <Settings size={14} />
          <span>{t('floating.stylesTab')}</span>
        </button>
      )}

      {floatingPanelOpen && (
        <div className="floating-panel" ref={floatingPanelRef}>
          <div className="floating-panel-header">
            <strong>{t('floating.title')}</strong>
            <button
              className="floating-panel-close"
              onClick={() => setFloatingPanelOpen(false)}
              title={t('brush.close')}
            >
              <Minus size={14} />
            </button>
          </div>

          <div className="floating-panel-tabs">
            <button
              className={`floating-panel-tab ${floatingPanelTab === 'styles' ? 'active' : ''}`}
              onClick={() => setFloatingPanelTab('styles')}
            >
              {t('floating.stylesTab')}
            </button>
            <button
              className={`floating-panel-tab ${floatingPanelTab === 'effects' ? 'active' : ''}`}
              onClick={() => setFloatingPanelTab('effects')}
            >
              {t('floating.effectsTab')}
            </button>
          </div>

          {floatingPanelTab === 'styles' && (
            <div className="floating-panel-body">
              <label className="floating-field">
                <span>{t('floating.styleName')}</span>
                <input
                  type="text"
                  value={styleNameDraft}
                  onChange={(event) => setStyleNameDraft(event.target.value)}
                  placeholder={t('floating.styleName')}
                />
              </label>

              <div className="floating-actions">
                <button
                  className="floating-action-btn primary"
                  onClick={saveCurrentStylePreset}
                  disabled={!activeObject || isActiveSelection(activeObject)}
                >
                  {t('floating.saveFromLayer')}
                </button>
                <button className="floating-action-btn" onClick={importStylePreset}>
                  {t('floating.importStyle')}
                </button>
              </div>

              <div className="floating-style-list">
                {stylePresets.length === 0 && (
                  <p className="floating-empty">{t('floating.noStyles')}</p>
                )}

                {stylePresets.map((preset) => (
                  <div key={preset.id} className="floating-style-card">
                    <div>
                      <strong>{preset.name}</strong>
                      <p>{preset.targetType || 'layer'}</p>
                    </div>
                    <div className="floating-style-actions">
                      <button
                        className="floating-inline-btn"
                        onClick={() => applyStylePreset(preset)}
                        disabled={!activeObject || isActiveSelection(activeObject)}
                      >
                        {t('floating.apply')}
                      </button>
                      <button
                        className="floating-inline-btn"
                        onClick={() => exportStylePreset(preset)}
                      >
                        {t('floating.export')}
                      </button>
                      <button
                        className="floating-inline-btn danger"
                        onClick={() => deleteStylePreset(preset.id)}
                      >
                        {t('floating.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {floatingPanelTab === 'effects' && (
            <div className="floating-panel-body">
              {!activeObject || isActiveSelection(activeObject) ? (
                <p className="floating-empty">{t('floating.selectSingleLayer')}</p>
              ) : (
                <>
                  {[
                    ['brightness', t('floating.brightness'), -100, 100],
                    ['contrast', t('floating.contrast'), -100, 100],
                    ['saturation', t('floating.saturation'), -100, 100],
                    ['blur', t('floating.blur'), 0, 100],
                    ['noise', t('floating.noise'), 0, 100]
                  ].map(([key, label, min, max]) => (
                    <label key={key} className="floating-slider">
                      <span>
                        {label}
                        <strong>{activeEffects[key]}</strong>
                      </span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        value={activeEffects[key]}
                        disabled={!isImageObject(activeObject)}
                        onChange={(event) =>
                          updateActiveObjectEffects(
                            key,
                            Number.parseInt(event.target.value, 10) || 0
                          )
                        }
                      />
                    </label>
                  ))}

                  <label className="floating-field">
                    <span>{t('floating.tint')}</span>
                    <input
                      type="color"
                      value={activeEffects.tint}
                      disabled={!isImageObject(activeObject)}
                      onChange={(event) => updateActiveObjectEffects('tint', event.target.value)}
                    />
                  </label>

                  <label className="floating-slider">
                    <span>
                      {t('floating.tintIntensity')}
                      <strong>{activeEffects.tintAlpha}</strong>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={activeEffects.tintAlpha}
                      disabled={!isImageObject(activeObject)}
                      onChange={(event) =>
                        updateActiveObjectEffects(
                          'tintAlpha',
                          Number.parseInt(event.target.value, 10) || 0
                        )
                      }
                    />
                  </label>

                  {isImageObject(activeObject) && (
                    <>
                      <div className="floating-ai-card">
                        <div className="floating-ai-info">
                          <strong>{t('floating.vectorizeCard')}</strong>
                        </div>
                        <div className="floating-actions">
                          <button
                            className="floating-action-btn primary"
                            onClick={() => handleVectorizeImage(activeObject, 'color')}
                            disabled={isVectorizing}
                          >
                            <Shapes size={14} />
                            <span>{isVectorizing ? t('layers.vectorizing') : t('layers.vectorize')}</span>
                          </button>
                          <button
                            className="floating-action-btn"
                            onClick={() => handleVectorizeImage(activeObject, 'bw')}
                            disabled={isVectorizing}
                          >
                            <span>{t('layers.vectorizeBw')}</span>
                          </button>
                        </div>
                      </div>

                      <div className="floating-ai-card">
                        <div className="floating-ai-info">
                          <strong>{t('floating.aiCutout')}</strong>
                        </div>
                        <div className="floating-actions">
                          <button
                            className="floating-action-btn primary"
                            onClick={handleRemoveBackground}
                            disabled={isRemovingBg}
                          >
                            <Sparkles size={14} />
                            <span>{isRemovingBg ? t('layers.removingBg') : t('layers.removeBg')}</span>
                          </button>
                          {activeObject.originalSrc && (
                            <button
                              className="floating-action-btn"
                              onClick={handleRestoreBackground}
                              disabled={isRemovingBg}
                            >
                              <span>{t('layers.restoreBg')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {init && activeTool === 'pencil' && (
        <div className="brush-toolbar">
          <div className="brush-toolbar-group">
            <span className="brush-toolbar-label">{t('brush.brush')}</span>
            <strong>{t(activeBrushType.labelKey)}</strong>
          </div>

          <label className="brush-toolbar-control brush-toolbar-color">
            <span>{t('brush.color')}</span>
            <input
              type="color"
              value={brushColor}
              onChange={(event) => setBrushColor(event.target.value)}
            />
          </label>

          <label className="brush-toolbar-control">
            <span>{t('brush.size')}</span>
            <input
              type="number"
              min="1"
              max="160"
              value={settingsState.brushSize}
              onChange={(event) =>
                updateBrushSettings({
                  brushSize: Math.max(1, Number.parseInt(event.target.value, 10) || 4)
                })
              }
            />
          </label>

          <button
            ref={brushSettingsButtonRef}
            className={`brush-toolbar-gear ${brushSettingsOpen ? 'active' : ''}`}
            onClick={() => setBrushSettingsOpen((current) => !current)}
            title={t('brush.settingsTitle')}
          >
            <Settings size={14} />
          </button>

          {brushSettingsOpen && (
            <div className="brush-settings-popover" ref={brushSettingsRef}>
              <div className="brush-settings-head">
                <strong>{t('brush.settingsTitle')}</strong>
                <button className="font-close-btn" onClick={() => setBrushSettingsOpen(false)}>
                  {t('brush.close')}
                </button>
              </div>

              <div className="brush-type-grid">
                {BRUSH_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`brush-type-btn ${
                      settingsState.brushType === option.value ? 'active' : ''
                    }`}
                    onClick={() => updateBrushSettings({ brushType: option.value })}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>

              <label className="brush-settings-field">
                <span>{t('brush.opacity')}</span>
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={settingsState.brushOpacity}
                  onChange={(event) =>
                    updateBrushSettings({
                      brushOpacity: Math.max(5, Number.parseInt(event.target.value, 10) || 100)
                    })
                  }
                />
                <strong>{settingsState.brushOpacity}%</strong>
              </label>

              {settingsState.brushType !== 'custom' && (
                <label className="brush-settings-field">
                  <span>{t('brush.smoothing')}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settingsState.brushSmoothing ?? 50}
                    onChange={(event) =>
                      updateBrushSettings({
                        brushSmoothing: Number.parseInt(event.target.value, 10)
                      })
                    }
                  />
                  <strong>{settingsState.brushSmoothing ?? 50}%</strong>
                </label>
              )}

              {settingsState.brushType === 'custom' && (
                <div className="brush-seed-block">
                  <label className="brush-settings-field">
                    <span>{t('brush.seed')}</span>
                    <input
                      type="number"
                      value={settingsState.brushSeed}
                      onChange={(event) =>
                        updateBrushSettings({
                          brushSeed: Number.parseInt(event.target.value, 10) || 1
                        })
                      }
                    />
                  </label>
                  <button className="floating-action-btn" onClick={generateBrushSeed}>
                    <RefreshCcw size={14} />
                    {t('brush.generateSeed')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTextObject && (
        <div className="text-toolbar">
          <button
            className="text-tb-btn"
            onClick={() =>
              applyActiveObjectUpdate((object) => {
                object.set('fontWeight', object.fontWeight === 'bold' ? 'normal' : 'bold')
              })
            }
            style={{ fontWeight: activeTextObject.fontWeight === 'bold' ? 'bold' : 'normal' }}
          >
            B
          </button>
          <button
            className="text-tb-btn"
            onClick={() =>
              applyActiveObjectUpdate((object) => {
                object.set('fontStyle', object.fontStyle === 'italic' ? 'normal' : 'italic')
              })
            }
            style={{ fontStyle: activeTextObject.fontStyle === 'italic' ? 'italic' : 'normal' }}
          >
            I
          </button>
          <button
            className="text-tb-btn"
            onClick={() =>
              applyActiveObjectUpdate((object) => {
                object.set('underline', !object.underline)
              })
            }
            style={{ textDecoration: activeTextObject.underline ? 'underline' : 'none' }}
          >
            U
          </button>

          <button
            ref={fontMenuButtonRef}
            className="font-picker-trigger"
            onClick={() => setFontPickerOpen((previous) => !previous)}
          >
            <span>{activeTextObject.fontFamily || 'Inter'}</span>
            <ChevronDown size={16} />
          </button>

          <select
            value={activeTextObject.fontSize || 48}
            className="text-toolbar-select"
            onChange={(event) =>
              applyActiveObjectUpdate({ fontSize: Number.parseFloat(event.target.value) || 48 })
            }
          >
            {[12, 16, 24, 32, 48, 64, 72, 96].map((fontSize) => (
              <option key={fontSize} value={fontSize}>
                {fontSize}
              </option>
            ))}
          </select>

          {fontPickerOpen && (
            <div className="font-menu" ref={fontMenuRef} style={{ height: fontMenuHeight }}>
              <div className="font-menu-header">
                <strong>{t('fonts.title')}</strong>
                <button className="font-close-btn" onClick={() => setFontPickerOpen(false)}>
                  {t('fonts.close')}
                </button>
              </div>

              <div className="font-search-row">
                <input
                  type="text"
                  className="font-search-input"
                  placeholder={t('fonts.search')}
                  value={fontSearch}
                  onChange={(event) => setFontSearch(event.target.value)}
                />
              </div>

              <div className="font-sections-scroll">
                {[
                  { key: 'recent', label: t('fonts.recent'), fonts: filteredRecentFonts },
                  { key: 'recommended', label: t('fonts.recommended'), fonts: filteredRecommendedFonts },
                  { key: 'system', label: t('fonts.system'), fonts: filteredSystemFonts }
                ].map((section) => (
                  <div key={section.key} className="font-section">
                    <button
                      className="font-section-header"
                      onClick={() =>
                        setFontSections((current) => ({
                          ...current,
                          [section.key]: !current[section.key]
                        }))
                      }
                    >
                      <span>
                        {fontSections[section.key] ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                        {section.label}
                      </span>
                      <span className="font-section-count">{section.fonts.length}</span>
                    </button>

                    {fontSections[section.key] && (
                      <div className="font-section-list">
                        {section.fonts.length === 0 && (
                          <p className="font-section-empty">{t('fonts.empty')}</p>
                        )}
                        {section.fonts.map((fontName) => (
                          <button
                            key={`${section.key}-${fontName}`}
                            className={`font-option ${
                              activeTextObject.fontFamily === fontName ? 'active' : ''
                            }`}
                            onClick={() => applyFontFamily(fontName)}
                            style={{ fontFamily: fontName }}
                          >
                            <span>{fontName}</span>
                            {activeTextObject.fontFamily === fontName && <span>{t('fonts.selected')}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div
                className="font-menu-resizer"
                onMouseDown={(event) => startResize('font-menu', event)}
                aria-hidden="true"
              />
            </div>
          )}
        </div>
      )}

      <footer className="status-bar">
        <span>RAYTOLFAS DESIGNER</span>
        <span>
          {size.w} x {size.h} PX
        </span>
        <div className="zoom-controls">
          <button
            className="zoom-btn"
            onClick={() => setZoomLevel(zoom / 1.25)}
            disabled={!init}
            title={t('zoom.zoomOut')}
          >
            <ZoomOut size={13} />
          </button>
          <button
            className="zoom-value"
            onClick={() => setZoomLevel(1)}
            disabled={!init}
            title={t('zoom.zoom100')}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="zoom-btn"
            onClick={() => setZoomLevel(zoom * 1.25)}
            disabled={!init}
            title={t('zoom.zoomIn')}
          >
            <ZoomIn size={13} />
          </button>
          <button
            className="zoom-btn"
            onClick={fitToScreen}
            disabled={!init}
            title={t('zoom.fit')}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </footer>

      {projectSetupOpen && (
        <div className="project-overlay" onClick={() => setProjectSetupOpen(false)}>
          <div className="project-window" onClick={(event) => event.stopPropagation()}>
            <div className="project-header">
              <h2>{t('projectSetup.title')}</h2>
              <button className="settings-close-icon" onClick={() => setProjectSetupOpen(false)}>
                {t('brush.close')}
              </button>
            </div>

            <div className="project-grid">
              <label className="project-field project-field-wide">
                <span>{t('projectSetup.name')}</span>
                <input
                  type="text"
                  value={projectDraft.name}
                  onChange={(event) =>
                    setProjectDraft((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                />
              </label>

              <label className="project-field">
                <span>{t('projectSetup.template')}</span>
                <select
                  value={projectDraft.preset}
                  onChange={(event) => {
                    const preset = event.target.value
                    const presetSize = PRESET_SIZES[preset] || null

                    setProjectDraft((current) => ({
                      ...current,
                      preset,
                      width: presetSize?.width || current.width,
                      height: presetSize?.height || current.height
                    }))
                  }}
                >
                  <option value="custom">{t('presets.custom')}</option>
                  <option value="ytThumb">{t('presets.ytThumb')}</option>
                  <option value="igPost">{t('presets.igPost')}</option>
                  <option value="igStory">{t('presets.igStory')}</option>
                  <option value="tgBanner">{t('presets.tgBanner')}</option>
                  <option value="marketplace">{t('presets.marketplace')}</option>
                  <option value="fullHd">{t('presets.fullHd')}</option>
                  <option value="printA4">{t('presets.printA4')}</option>
                </select>
              </label>

              <label className="project-field">
                <span>{t('projectSetup.width')}</span>
                <input
                  type="number"
                  min="1"
                  value={projectDraft.width}
                  onChange={(event) =>
                    setProjectDraft((current) => ({
                      ...current,
                      preset: 'custom',
                      width: Number.parseInt(event.target.value, 10) || DEFAULT_SIZE.w
                    }))
                  }
                />
              </label>

              <label className="project-field">
                <span>{t('projectSetup.height')}</span>
                <input
                  type="number"
                  min="1"
                  value={projectDraft.height}
                  onChange={(event) =>
                    setProjectDraft((current) => ({
                      ...current,
                      preset: 'custom',
                      height: Number.parseInt(event.target.value, 10) || DEFAULT_SIZE.h
                    }))
                  }
                />
              </label>

              <label className="project-field">
                <span>{t('projectSetup.bgColor')}</span>
                <input
                  type="color"
                  value={projectDraft.backgroundColor}
                  disabled={projectDraft.transparentBackground}
                  onChange={(event) =>
                    setProjectDraft((current) => ({
                      ...current,
                      backgroundColor: event.target.value
                    }))
                  }
                />
              </label>

              <label className="project-toggle">
                <span>{t('projectSetup.transparentBg')}</span>
                <input
                  type="checkbox"
                  checked={projectDraft.transparentBackground}
                  onChange={(event) =>
                    setProjectDraft((current) => ({
                      ...current,
                      transparentBackground: event.target.checked
                    }))
                  }
                />
              </label>

              <label className="project-toggle">
                <span>{t('projectSetup.showGrid')}</span>
                <input
                  type="checkbox"
                  checked={projectDraft.showGrid}
                  onChange={(event) =>
                    setProjectDraft((current) => ({
                      ...current,
                      showGrid: event.target.checked
                    }))
                  }
                />
              </label>
            </div>

            <div className="project-actions">
              <button className="floating-action-btn" onClick={() => setProjectSetupOpen(false)}>
                {t('projectSetup.cancel')}
              </button>
              <button className="floating-action-btn primary" onClick={confirmProjectSetup}>
                {t('projectSetup.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-window" onClick={(event) => event.stopPropagation()}>
            <div className="settings-header">
              <h2 className="settings-title">{t('settings.title')}</h2>
              <button className="settings-close-icon" onClick={() => setSettingsOpen(false)}>
                {t('brush.close')}
              </button>
            </div>

            <div className="settings-body">
              <div className="settings-layout">
                <aside className="settings-nav">
                  {SETTINGS_SECTIONS.map((section) => (
                    <button
                      key={section.key}
                      className={`settings-nav-item ${
                        settingsCategory === section.key ? 'active' : ''
                      }`}
                      onClick={() => setSettingsCategory(section.key)}
                    >
                      {t(`settings.${section.key}`)}
                    </button>
                  ))}
                </aside>

                <div className="settings-content">
                  {settingsCategory === 'general' && (
                    <section className="settings-panel">
                      <div className="settings-panel-head">
                        <h3>{t('settings.general')}</h3>
                      </div>

                      <div className="settings-card-grid">
                        <div className="settings-card">
                          <div>
                            <strong>{t('settings.defaultColor')}</strong>
                          </div>
                          <input
                            type="color"
                            value={settingsState.defaultColor}
                            onChange={(event) =>
                              setSettingsState((current) => ({
                                ...current,
                                defaultColor: event.target.value
                              }))
                            }
                          />
                        </div>

                        <div className="settings-card">
                          <div>
                            <strong>{t('settings.brushSize')}</strong>
                          </div>
                          <input
                            type="number"
                            min="1"
                            max="160"
                            value={settingsState.brushSize}
                            onChange={(event) =>
                              updateBrushSettings({
                                brushSize: Math.max(1, Number.parseInt(event.target.value, 10) || 4)
                              })
                            }
                          />
                        </div>

                        <div className="settings-card">
                          <div>
                            <strong>{t('settings.brushType')}</strong>
                          </div>
                          <select
                            className="param-select"
                            value={settingsState.brushType}
                            onChange={(event) =>
                              updateBrushSettings({
                                brushType: event.target.value
                              })
                            }
                          >
                            {BRUSH_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {t(option.labelKey)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="settings-card">
                          <div>
                            <strong>{t('settings.brushOpacity')}</strong>
                          </div>
                          <input
                            type="number"
                            min="5"
                            max="100"
                            value={settingsState.brushOpacity}
                            onChange={(event) =>
                              updateBrushSettings({
                                brushOpacity: clamp(
                                  Number.parseInt(event.target.value, 10) || 100,
                                  5,
                                  100
                                )
                              })
                            }
                          />
                        </div>

                        <div className="settings-card">
                          <div>
                            <strong>{t('settings.brushSmoothing')}</strong>
                          </div>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={settingsState.brushSmoothing ?? 50}
                            onChange={(event) =>
                              updateBrushSettings({
                                brushSmoothing: clamp(
                                  Number.parseInt(event.target.value, 10) || 0,
                                  0,
                                  100
                                )
                              })
                            }
                          />
                        </div>

                        {settingsState.brushType === 'custom' && (
                          <div className="settings-card settings-card-wide">
                            <div>
                              <strong>{t('brush.seed')}</strong>
                            </div>
                            <div className="floating-actions">
                              <input
                                type="number"
                                min="1"
                                value={settingsState.brushSeed}
                                onChange={(event) =>
                                  updateBrushSettings({
                                    brushSeed: Number.parseInt(event.target.value, 10) || 1
                                  })
                                }
                              />
                              <button className="settings-small-btn" onClick={generateBrushSeed}>
                                <RefreshCcw size={14} />
                                {t('brush.generateSeed')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {settingsCategory === 'canvas' && (
                    <section className="settings-panel">
                      <div className="settings-panel-head">
                        <h3>{t('settings.canvas')}</h3>
                      </div>

                      <div className="settings-card-grid">
                        <div className="settings-card">
                          <div>
                            <strong>{t('settings.showGrid')}</strong>
                          </div>
                          <input
                            type="checkbox"
                            checked={settingsState.showGrid}
                            onChange={(event) =>
                              setSettingsState((current) => ({
                                ...current,
                                showGrid: event.target.checked
                              }))
                            }
                          />
                        </div>

                        <div className="settings-card">
                          <div>
                            <strong>{t('settings.gridSize')}</strong>
                          </div>
                          <input
                            type="number"
                            min="8"
                            max="128"
                            value={settingsState.gridSize}
                            onChange={(event) =>
                              setSettingsState((current) => ({
                                ...current,
                                gridSize: Math.max(8, Number.parseInt(event.target.value, 10) || 24)
                              }))
                            }
                          />
                        </div>
                      </div>
                    </section>
                  )}

                  {settingsCategory === 'snapping' && (
                    <section className="settings-panel">
                      <div className="settings-panel-head">
                        <h3>{t('settings.snapping')}</h3>
                      </div>

                      <div className="settings-card-grid">
                        <div className="settings-card">
                          <div>
                            <strong>{t('settings.snapEnabled')}</strong>
                          </div>
                          <input
                            type="checkbox"
                            checked={settingsState.snapEnabled}
                            onChange={(event) =>
                              setSettingsState((current) => ({
                                ...current,
                                snapEnabled: event.target.checked
                              }))
                            }
                          />
                        </div>

                        <div className="settings-card">
                          <div>
                            <strong>{t('settings.snapTolerance')}</strong>
                          </div>
                          <input
                            type="number"
                            min="1"
                            max="32"
                            value={settingsState.snapTolerance}
                            disabled={!settingsState.snapEnabled}
                            onChange={(event) =>
                              setSettingsState((current) => ({
                                ...current,
                                snapTolerance: Math.max(
                                  1,
                                  Number.parseInt(event.target.value, 10) || 8
                                )
                              }))
                            }
                          />
                        </div>
                      </div>
                    </section>
                  )}

                  {settingsCategory === 'interface' && (
                    <section className="settings-panel">
                      <div className="settings-panel-head">
                        <h3>{t('settings.interface')}</h3>
                      </div>

                      <div className="settings-card-grid">
                        <div className="settings-card">
                          <div>
                            <strong>{t('settings.sidebarWidth')}</strong>
                          </div>
                          <input
                            type="number"
                            min="260"
                            max="520"
                            value={sidebarWidth}
                            onChange={(event) =>
                              setSettingsState((current) => ({
                                ...current,
                                sidebarWidth: clamp(
                                  Number.parseInt(event.target.value, 10) || 320,
                                  260,
                                  520
                                )
                              }))
                            }
                          />
                        </div>

                        <div className="settings-card">
                          <div>
                            <strong>{t('settings.layerPanelHeight')}</strong>
                          </div>
                          <input
                            type="number"
                            min="220"
                            max="560"
                            value={layerPanelHeight}
                            onChange={(event) =>
                              setSettingsState((current) => ({
                                ...current,
                                layerPanelHeight: clamp(
                                  Number.parseInt(event.target.value, 10) || 320,
                                  220,
                                  560
                                )
                              }))
                            }
                          />
                        </div>
                      </div>
                    </section>
                  )}

                  {settingsCategory === 'fonts' && (
                    <section className="settings-panel">
                      <div className="settings-panel-head">
                        <h3>{t('settings.fonts')}</h3>
                      </div>

                      <div className="settings-card-grid">
                        <div className="settings-card settings-card-wide">
                          <div>
                            <strong>{t('settings.recentFontsTitle')}</strong>
                            <p>{t('settings.recentFontsCount', { count: settingsState.recentFonts.length || 0 })}</p>
                          </div>
                          <button
                            className="settings-small-btn"
                            onClick={() =>
                              setSettingsState((current) => ({
                                ...current,
                                recentFonts: []
                              }))
                            }
                          >
                            <RefreshCcw size={14} />
                            {t('settings.clearRecentFonts')}
                          </button>
                        </div>
                      </div>
                    </section>
                  )}

                  {settingsCategory === 'language' && (
                    <section className="settings-panel">
                      <div className="settings-panel-head">
                        <h3>{t('settings.language')}</h3>
                      </div>

                      <div className="settings-card-grid">
                        <div className="settings-card settings-card-wide">
                          <div>
                            <strong>{t('settings.languageSelect')}</strong>
                          </div>
                          <select
                            className="param-select"
                            value={settingsState.language || 'en'}
                            onChange={(event) =>
                              setSettingsState((current) => ({
                                ...current,
                                language: event.target.value
                              }))
                            }
                          >
                            {SUPPORTED_LANGUAGES.map((lang) => (
                              <option key={lang.code} value={lang.code}>
                                {lang.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </section>
                  )}

                  {settingsCategory === 'about' && (
                    <section className="settings-panel">
                      <div className="settings-panel-head">
                        <h3>{t('settings.about')}</h3>
                      </div>

                      <div className="settings-about-card">
                        <img src={appIcon} alt="Raytolfas" className="about-logo" />
                        <div>
                          <strong>{appInfo.name}</strong>
                          <p>{t('settings.version')} {appInfo.version}</p>
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="nav-overlay" onClick={closeAppMenu}>
          <div className="nav-menu" onClick={(event) => event.stopPropagation()}>
            {menuView === 'main' && (
              <>
                <button className="nav-item" onClick={handleCreateProject}>
                  <FilePlus size={18} />
                  <span>{t('menu.createProject')}</span>
                  <kbd className="nav-kbd">Ctrl+N</kbd>
                </button>
                <button className="nav-item" onClick={() => handleOpenProject()}>
                  <FolderOpen size={18} />
                  <span>{t('menu.openProject')}</span>
                  <kbd className="nav-kbd">Ctrl+O</kbd>
                </button>
                {init && (
                  <>
                    <button className="nav-item" onClick={() => handleSaveProject()}>
                      <Save size={18} />
                      <span>{t('menu.saveProject')}</span>
                      <kbd className="nav-kbd">Ctrl+S</kbd>
                    </button>
                    <button
                      className="nav-item"
                      onClick={() => handleSaveProject({ saveAs: true })}
                    >
                      <Save size={18} />
                      <span>{t('menu.saveAs')}</span>
                      <kbd className="nav-kbd">Ctrl+Shift+S</kbd>
                    </button>
                    <button className="nav-item" onClick={handleOpenFile}>
                      <Image size={18} />
                      <span>{t('menu.openFile')}</span>
                    </button>
                    <button className="nav-item" onClick={() => setMenuView('export')}>
                      <Download size={18} />
                      <span>{t('menu.export')}</span>
                      <ChevronRight size={16} />
                    </button>
                  </>
                )}
                <button
                  className="nav-item"
                  onClick={() => {
                    setMenuOpen(false)
                    setSettingsOpen(true)
                  }}
                >
                  <Settings size={18} />
                  <span>{t('menu.settings')}</span>
                </button>
                <button className="nav-item" onClick={() => setMenuView('about')}>
                  <Info size={18} />
                  <span>{t('menu.about')}</span>
                  <ChevronRight size={16} />
                </button>
              </>
            )}

            {menuView === 'export' && (
              <>
                <button className="nav-item nav-back" onClick={() => setMenuView('main')}>
                  <MoveLeft size={16} />
                  <span>{t('menu.back')}</span>
                </button>
                <button className="nav-item" onClick={() => handleExport('png')}>
                  <span>PNG</span>
                </button>
                <button className="nav-item" onClick={() => handleExport('jpeg')}>
                  <span>JPEG</span>
                </button>
                <button className="nav-item" onClick={() => handleExport('svg')}>
                  <span>SVG</span>
                </button>
                <button className="nav-item" onClick={() => handleExport('pdf')}>
                  <span>PDF</span>
                </button>
              </>
            )}

            {menuView === 'about' && (
              <>
                <button className="nav-item nav-back" onClick={() => setMenuView('main')}>
                  <MoveLeft size={16} />
                  <span>{t('menu.back')}</span>
                </button>
                <div className="about-card">
                  <img src={appIcon} alt="Raytolfas" className="about-logo" />
                  <h3>{appInfo.name}</h3>
                  <p>{t('settings.version')} {appInfo.version}</p>
                  <div className="about-links">
                    {appInfo.links.map((link) => (
                      <a
                        key={link.label}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="about-link"
                      >
                        <span>{link.label}</span>
                        <ExternalLink size={14} />
                      </a>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
