import {Fragment, type ReactNode} from 'react'

/**
 * A translated text with elements in it: `{name}` becomes `nodes.name` and `**text**` becomes bold text, so that the
 * whole sentence stays one text for the translator and the elements land where the language needs them.
 */
export function rich(text: string, nodes: Record<string, ReactNode> = {}): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\{\w+\})/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <b key={i}>{part.slice(2, -2)}</b>
    const m = /^\{(\w+)\}$/.exec(part)
    if (m && m[1] in nodes) return <Fragment key={i}>{nodes[m[1]]}</Fragment>
    return part
  })
}
