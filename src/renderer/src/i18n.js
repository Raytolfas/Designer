import en from './locales/en.json'
import ru from './locales/ru.json'
import uk from './locales/uk.json'

export const dictionaries = { en, ru, uk }

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' }
]

function getNestedValue(obj, path) {
  if (!obj || !path) return undefined
  const parts = path.split('.')
  let current = obj
  for (let i = 0; i < parts.length; i++) {
    if (current === undefined || current === null) return undefined
    current = current[parts[i]]
  }
  return current
}

export function getTranslation(lang, path, params = {}) {
  const dictionary = dictionaries[lang] || dictionaries.en
  let val = getNestedValue(dictionary, path)
  if (val === undefined && lang !== 'en') {
    val = getNestedValue(dictionaries.en, path)
  }
  if (typeof val !== 'string') {
    return path
  }
  if (params && typeof params === 'object') {
    return Object.keys(params).reduce((str, key) => {
      return str.replaceAll(`{${key}}`, String(params[key]))
    }, val)
  }
  return val
}
