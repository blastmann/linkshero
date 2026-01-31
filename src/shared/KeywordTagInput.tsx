import type { KeyboardEvent } from 'react'
import { addKeywords, splitKeywords } from './keyword-tags'
import { useTranslation } from './i18n-provider'

type Props = {
  label: string
  placeholder?: string
  tags: string[]
  value: string
  onChangeTags: (next: string[]) => void
  onChangeValue: (next: string) => void
}

export function KeywordTagInput({
  label,
  placeholder,
  tags,
  value,
  onChangeTags,
  onChangeValue
}: Props) {
  const { t } = useTranslation()
  const commit = () => {
    const next = addKeywords(tags, value)
    if (next !== tags) {
      onChangeTags(next)
    }
    if (splitKeywords(value).length) {
      onChangeValue('')
    }
  }

  const removeTag = (target: string) => {
    onChangeTags(tags.filter(tag => tag !== target))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
      return
    }
    if (event.key === 'Backspace' && !value && tags.length) {
      event.preventDefault()
      onChangeTags(tags.slice(0, -1))
      return
    }
  }

  return (
    <label className="tag-input">
      <span className="tag-input-label">{label}</span>
      <div className="tag-input-box">
        {tags.map(tag => (
          <button
            key={tag}
            type="button"
            className="tag"
            onClick={() => removeTag(tag)}
            title={t('tagDelete')}
          >
            <span className="tag-text">{tag}</span>
            <span className="tag-x" aria-hidden="true">
              ×
            </span>
          </button>
        ))}
        <input
          className="tag-input-field"
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={event => onChangeValue(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit()}
        />
      </div>
      <span className="tag-input-helper">{t('tagInputHelper')}</span>
    </label>
  )
}

